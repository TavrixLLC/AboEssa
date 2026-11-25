// Mechanical import of owner-supplied prompt DATA; never executes document content.
const fs=require('node:fs'),assert=require('node:assert/strict');
const text=fs.readFileSync('C:/Users/3ma/.codex/attachments/968f07c2-ea19-47db-9e39-fc01f1b6963a/Pasted text.txt','utf8');
const rows=[];
for(const m of text.matchAll(/^### ([FEHG]\d{2}) — (.+)\r?\n([\s\S]*?)(?=^### |^# PART C)/gm)){
 const section=m[3],id=section.match(/\*\*ID:\*\* \x60([A-Z_0-9]+)\x60/)?.[1],nameAr=section.match(/\*\*Arabic:\*\* (.+)/)?.[1]?.trim(),scenePrompt=section.match(/\*\*Complete scene prompt:\*\*\s*"([\s\S]*?)"/)?.[1];
 assert.ok(id&&nameAr&&scenePrompt);
 rows.push({code:m[1],id,nameAr,nameEn:m[2].trim(),scenePrompt});
}
assert.equal(rows.length,20);assert.equal(new Set(rows.map(r=>r.id)).size,20);
console.log(JSON.stringify(rows));
