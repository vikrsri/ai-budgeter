import ts from 'typescript';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
mkdirSync('.test-build',{recursive:true});
for(const name of ['transactions','recurring','import-csv','insights']){
 const input=readFileSync(`lib/${name}.ts`,'utf8');
 const output=ts.transpileModule(input,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from "\.\/([\w-]+)"/g,'from "./$1.mjs"');
 writeFileSync(`.test-build/${name}.mjs`,output);
}
const run=spawnSync(process.execPath,['--test','tests/transactions.test.mjs'],{stdio:'inherit'});process.exit(run.status??1);
