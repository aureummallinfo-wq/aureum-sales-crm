const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const {createNeonRepository}=require('../../../backend/db/neon-repository');
const {createRelationalApi}=require('../../../backend/db/relational-api');

test('saved note editing uses isolated PostgreSQL fixtures',async t=>{
  const db=new PGlite();t.after(()=>db.close());
  for(const file of ['002_production_crm_schema.sql','003_workspace_settings.sql','014_edit_saved_notes.sql'])await db.exec(fs.readFileSync(path.join(__dirname,'../../../db/migrations',file),'utf8').replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;',''));
  const sql={query:async(text,params)=>(await db.query(text,params)).rows};const repo=createNeonRepository(sql);
  // Applying migrations twice is supported by the existing migration runner.
  await db.exec(fs.readFileSync(path.join(__dirname,'../../../db/migrations/014_edit_saved_notes.sql'),'utf8'));
  const [w]=await sql.query("INSERT INTO crm.workspaces(name) VALUES('Isolated notes') RETURNING id");
  const [otherWorkspace]=await sql.query("INSERT INTO crm.workspaces(name) VALUES('Other tenant') RETURNING id");
  const [team]=await sql.query("INSERT INTO crm.teams(workspace_id,name,legacy_id) VALUES($1,'Team','team') RETURNING id",[w.id]);
  const actors={};
  for(const [id,role,teamId] of [['agent','sales_agent',team.id],['other','sales_agent',team.id],['manager','sales_manager',team.id],['outside','sales_manager',null],['admin','super_admin',team.id]]){
    const [u]=await sql.query("INSERT INTO crm.users(workspace_id,legacy_id,email,full_name,password_hash,role_key,team_id) VALUES($1,$2,$3,$2,'isolated-fixture',$4,$5) RETURNING id",[w.id,id,id+'@example.test',role,teamId]);
    actors[id]={id,role,team_id:teamId?'team':null,dbId:u.id};
  }
  const [lead]=await sql.query("INSERT INTO crm.leads(workspace_id,legacy_id,full_name,assigned_agent_id,assigned_team_id) VALUES($1,'lead','Fixture',$2,$3) RETURNING id",[w.id,actors.agent.dbId,team.id]);
  const [customer]=await sql.query("INSERT INTO crm.customers(workspace_id,legacy_id,lead_id,full_name,assigned_agent_id,assigned_team_id) VALUES($1,'customer',$2,'Fixture',$3,$4) RETURNING id",[w.id,lead.id,actors.agent.dbId,team.id]);
  await sql.query("INSERT INTO crm.follow_ups(workspace_id,lead_id,customer_id,assigned_agent_id,follow_up_type,due_at,notes) VALUES($1,$2,$3,$4,'Call',now(),'Keep original follow-up')",[w.id,lead.id,customer.id,actors.agent.dbId]);
  const before=await sql.query('SELECT * FROM crm.follow_ups');
  for(const kind of ['lead','customer']){
    const parent=kind==='lead'?lead:customer;const identifier=kind;
    const [n]=await sql.query(`INSERT INTO crm.${kind}_notes(${kind}_id,author_user_id,note) VALUES($1,$2,'Original') RETURNING *`,[parent.id,actors.agent.dbId]);
    for(const entity of ['lead','customer'])await sql.query(`INSERT INTO crm.${entity}_activities(${entity}_id,actor_user_id,activity_type,description,metadata) VALUES($1,$2,'Note added','Original',$3)`,[entity==='lead'?lead.id:customer.id,actors.agent.dbId,JSON.stringify({note_id:n.id})]);
    const edit=(actor,version,note='Changed')=>repo.editSavedNote(w.id,kind,identifier,n.id,actor,{version,note});
    await t.test(kind+': permissions including admin least privilege and tenant scope',async()=>{
      for(const actor of [actors.other,actors.outside,actors.admin])assert.equal((await edit(actor,1)).status,403);
      assert.equal((await repo.editSavedNote(otherWorkspace.id,kind,identifier,n.id,actors.agent,{version:1,note:'Attack'})).status,404);
      assert.equal((await repo.listSavedNotes(w.id,kind,identifier,actors.other)).length,0);
      assert.equal(await repo.noteHistory(w.id,kind,identifier,n.id,actors.other),null);
    });
    await t.test(kind+': validation, own edit, immutable identity, attribution and history',async()=>{
      for(const note of ['','   ','x'.repeat(2001)])assert.equal((await edit(actors.agent,1,note)).status,422);
      const result=await edit(actors.agent,1,'<script>alert(1)</script>');assert.equal(result.status,200);
      assert.equal(result.data.id,n.id);assert.equal(result.data.author_user_id,n.author_user_id);assert.equal(new Date(result.data.created_at).toISOString(),n.created_at.toISOString());
      assert.equal(result.data.version,2);assert.equal(result.data.edited_by,actors.agent.dbId);
      const history=await repo.noteHistory(w.id,kind,identifier,n.id,actors.agent);assert.equal(history.length,1);assert.equal(history[0].previous_content,'Original');assert.equal(history[0].new_content,'<script>alert(1)</script>');
      const notes=await repo.listSavedNotes(w.id,kind,identifier,actors.agent);assert.equal(notes[0].can_edit,true);assert.equal(notes[0].user_name,'agent');assert.equal(notes[0].edited_by_name,'agent');
    });
    await t.test(kind+': manager edit displays actual editor and stale concurrent save conflicts',async()=>{
      const results=await Promise.all([edit(actors.manager,2,'Manager correction'),edit(actors.agent,2,'Concurrent correction')]);
      assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
      const saved=(await repo.listSavedNotes(w.id,kind,identifier,actors.manager))[0];assert.equal(saved.user_name,'agent');assert.equal(saved.version,3);
      const revisions=await repo.noteHistory(w.id,kind,identifier,n.id,actors.manager);assert.equal(revisions.length,2);
      assert.equal((await edit(actors.manager,3,'Final manager correction')).status,200);
      assert.equal((await repo.listSavedNotes(w.id,kind,identifier,actors.manager))[0].edited_by_name,'manager');
    });
    await t.test(kind+': linked timelines synchronize and legacy writes cannot overwrite edited text',async()=>{
      for(const entity of ['lead','customer']){
        const rows=entity==='lead'?await repo.listLeadActivities(w.id,'lead'):await repo.listCustomerActivities(w.id,'customer');
        const item=rows.find(a=>a.metadata.note_id===n.id);assert.equal(item.description,'Final manager correction');assert.equal(item.metadata.note_edited_by,'manager');
      }
      await sql.query(`UPDATE crm.${kind}_notes SET note='Stale legacy content' WHERE id=$1`,[n.id]);
      assert.equal((await repo.listSavedNotes(w.id,kind,identifier,actors.agent))[0].note,'Final manager correction');
      for(const entity of ['lead','customer']){
        await sql.query(`UPDATE crm.${entity}_activities SET description='Stale legacy activity',metadata='{}' WHERE metadata->>'note_id'=$1`,[n.id]);
        const rows=entity==='lead'?await repo.listLeadActivities(w.id,'lead'):await repo.listCustomerActivities(w.id,'customer');
        assert.equal(rows.find(a=>a.metadata.note_id===n.id).description,'Final manager correction');
      }
    });
    await t.test(kind+': audit failure rolls back note and timeline',async()=>{
      await db.exec("CREATE OR REPLACE FUNCTION crm.fail_note_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit unavailable'; END $$; CREATE TRIGGER fail_note_audit BEFORE INSERT ON crm.note_revisions FOR EACH ROW EXECUTE FUNCTION crm.fail_note_audit();");
      await assert.rejects(edit(actors.agent,4,'Must roll back'),/audit unavailable/);
      assert.equal((await repo.listSavedNotes(w.id,kind,identifier,actors.agent))[0].note,'Final manager correction');
      await db.exec('DROP TRIGGER fail_note_audit ON crm.note_revisions');
    });
  }
  await t.test('authenticated API validates input, enforces ownership and returns conflicts/history',async()=>{
    const api=createRelationalApi({repository:repo,workspaceId:w.id,json:(res,status,body)=>Object.assign(res,{status,body}),readBody:async req=>req.body});
    const [note]=await sql.query("INSERT INTO crm.customer_notes(customer_id,author_user_id,note) VALUES($1,$2,'API original') RETURNING id",[customer.id,actors.agent.dbId]);
    const url=new URL(`http://isolated.test/api/customers/customer/notes/${note.id}`);
    const request=async(actor,body,method='PATCH',suffix='')=>{const res={};await api.handle({method,body},res,new URL(url+suffix),actor);return res;};
    assert.equal((await request(null,{note:'No session',version:1})).status,401);
    assert.equal((await request(actors.other,{note:'Other author',version:1})).status,403);
    for(const body of [{note:'   ',version:1},{note:'x'.repeat(2001),version:1},{note:'Missing version'},{note:'Bad version',version:'1'}])assert.equal((await request(actors.agent,body)).status,422);
    assert.equal((await request(actors.agent,{note:'API changed',version:1,author_user_id:actors.admin.dbId})).status,200);
    assert.equal((await request(actors.agent,{note:'Stale',version:1})).status,409);
    assert.equal((await request(actors.manager,null,'GET','/history')).body.data[0].previous_content,'API original');
    assert.equal((await request(actors.other,null,'GET','/history')).status,403);
    assert.equal((await request(actors.admin,null,'GET','/history')).status,200);
    const saved=(await repo.listSavedNotes(w.id,'customer','customer',actors.agent)).find(n=>n.id===note.id);assert.equal(saved.user_name,'agent');
    // No original activity existed: editing adds a linked projection and leaves
    // unrelated historical activities intact.
    assert.equal((await repo.listCustomerActivities(w.id,'customer')).find(a=>a.metadata.note_id===note.id).description,'API changed');
    assert.equal((await repo.listLeadActivities(w.id,'lead')).find(a=>a.metadata.note_id===note.id).description,'API changed');
  });
  await t.test('managers and admins can edit their own notes; null team cannot bypass SQL scope',async()=>{
    for(const actor of [actors.manager,actors.admin]){
      const [n]=await sql.query('INSERT INTO crm.lead_notes(lead_id,author_user_id,note) VALUES($1,$2,$3) RETURNING id',[lead.id,actor.dbId,'Own '+actor.id]);
      assert.equal((await repo.editSavedNote(w.id,'lead','lead',n.id,actor,{version:1,note:'Own correction'})).status,200);
    }
    const [n]=await sql.query("INSERT INTO crm.lead_notes(lead_id,note) VALUES($1,'Deleted author') RETURNING id",[lead.id]);
    assert.equal((await repo.editSavedNote(w.id,'lead','lead',n.id,actors.admin,{version:1,note:'Cannot claim authorship'})).status,403);
    assert.equal((await repo.editSavedNote(w.id,'lead','lead',n.id,actors.outside,{version:1,note:'No team'})).status,403);
  });
  assert.deepEqual(await sql.query('SELECT * FROM crm.follow_ups'),before);
});
