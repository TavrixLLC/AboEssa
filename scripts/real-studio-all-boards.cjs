const fs=require('node:fs'),path=require('node:path'),sharp=require('sharp'),{createHash}=require('node:crypto');
const m=JSON.parse(fs.readFileSync('D:/rezona-real-studio-qa/manifest.json','utf8')),index=JSON.parse(fs.readFileSync(path.join(m.dir,'review-index.json'),'utf8'));
(async()=>{
 const boards=[];
 for(const p of index.photos){
  const source=m.photos.find(s=>s.photoId===p.photoId),method=p.segmentationMethod==='GUIDED_REAL_ONNX'?'guided':'auto';
  const inputs=[source.original,path.join(m.dir,'media',p.tag+'-'+method+'-candidate.webp'),path.join(m.dir,'media',p.tag+(p.previewAllowed?'-LOCAL-PREVIEW.webp':'-clean-candidate.webp'))];
  const labels=['ORIGINAL - UNCHANGED',p.previewAllowed?'REAL ONNX - EMPLOYEE REVIEW PENDING':'UNSAFE / INCOMPLETE LOCAL MASK - DO NOT SELECT',p.previewAllowed?'LOCAL PREVIEW - NO FAL / NOT APPROVED':'CLEAN ORIGINAL FALLBACK - NOT ISOLATION'];
  const panels=[];for(let i=0;i<inputs.length;i++)panels.push({input:await sharp(inputs[i]).resize(450,450,{fit:'contain',background:'#1A1D1D'}).png().toBuffer(),left:i*470+10,top:75});
  const title=`${p.tag} - ${p.previewAllowed?'READY FOR HUMAN REVIEW, NOT ACCEPTED':p.sourceStatus==='RECAPTURE_NEEDED'?'RECAPTURE NEEDED + SEGMENTATION REVIEW':'SEGMENTATION REVIEW REQUIRED'} - REAL FAL NOT AUTHORIZED`;
  const svg=Buffer.from(`<svg width="1410" height="555"><rect width="1410" height="555" fill="#0C0F0F"/><text x="12" y="26" font-family="Arial" font-size="21" fill="${p.previewAllowed?'#E7BC61':'#FFBE94'}">${title}</text>${labels.map((label,i)=>`<text x="${i*470+12}" y="60" font-family="Arial" font-size="15" fill="white">${label}</text>`).join('')}<text x="12" y="546" font-family="Arial" font-size="15" fill="#E7BC61">Captured original photo and actual local worker outputs only. No generated provider image, fabricated mask, inventory registration or automatic approval.</text></svg>`);
  const bytes=await sharp(svg).composite(panels).png().toBuffer(),file=path.join(m.dir,'media',p.tag+'-before-after.png');fs.writeFileSync(file,bytes,{flag:'wx'});boards.push({photoId:p.photoId,tag:p.tag,file,sha256:createHash('sha256').update(bytes).digest('hex'),label:title});
 }
 fs.writeFileSync(path.join(m.out,'all17-comparison-boards.json'),JSON.stringify({boards,private:true,realFalResults:0},null,2),{flag:'wx'});console.log(JSON.stringify({privateBoards:boards.length,paidCalls:0}));
})().catch(e=>{console.error(e.message);process.exit(1);});
