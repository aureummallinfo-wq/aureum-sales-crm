const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname,'..');
function testFiles(directory) {
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry => {
    const fullPath=path.join(directory,entry.name);
    return entry.isDirectory() ? testFiles(fullPath) : /\.(test|spec)\.js$/.test(entry.name) ? [fullPath] : [];
  });
}
// Node 20 on Windows does not expand quoted test globs.
const result=spawnSync(process.execPath,['--test','--test-concurrency=4',...testFiles(path.join(root,'src/tests')).sort()],{cwd:root,stdio:'inherit'});
if (result.error) { console.error(result.error.message);process.exitCode=1; }
else process.exitCode=result.status ?? 1;
