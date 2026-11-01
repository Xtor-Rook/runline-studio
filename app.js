(() => {
'use strict';
const C={bg:'#0B0D0E',field:'#F2F0E9',grid:'#7C8888',teal:'#21C7B7',contact:'#4B83A6',tunnel:'#D59345',red:'#D94B4B',neutral:'#3E484B'};
const $=id=>document.getElementById(id),canvas=$('courseCanvas'),ctx=canvas.getContext('2d'),wrap=$('canvasWrap'),workspace=$('workspace'),empty=$('emptyHint');
const dpr=Math.max(1,Math.min(2,devicePixelRatio||1));
const names={jump:'Jump',redjump:'Snooker red',double:'Double jump',triple:'Triple jump',wall:'Wall',tire:'Tire',longjump:'Long jump',weaves:'Weave poles',dogwalk:'Dog walk',aframe:'A-frame',teeter:'Teeter',tunnel:'Tunnel',table:'Table',arrow:'Direction arrow',start:'Start',finish:'Finish',startfinish:'Start / Finish'};
const defs={jump:{w:3,h:.28},redjump:{w:3,h:.28},double:{w:3,h:.65},triple:{w:3,h:1},wall:{w:3,h:.42},tire:{w:2,h:.55},longjump:{w:1.2,h:3.5},weaves:{w:.45,h:7.2},dogwalk:{w:1,h:11},aframe:{w:2.2,h:5.6},teeter:{w:1,h:4},tunnel:{w:5,h:1,curve:.35},table:{w:1.2,h:1.2},arrow:{w:3.2,h:.9},start:{w:1.4,h:1.4},finish:{w:1.4,h:1.4},startfinish:{w:4.2,h:1.2}};
const S={field:{w:20,h:40,unit:'m',showGrid:true,showAxes:false,snap:false,grid:2},items:[],annotations:[],title:'Untitled Course',selected:null,selectedKind:null,selectedNumberId:null,tool:'select',zoom:1,pan:{x:0,y:0},autoNumber:false,nextNumber:1,exportFormat:'png',exportGrid:false,exportTitle:true,background:{src:null,opacity:.35},backgroundImage:null,drag:null,drawing:null,pointers:new Map(),pinch:null,undo:[],redo:[],restoring:false};
let V={left:0,top:0,width:0,height:0,scale:1},installPrompt=null;

function project(){return{version:3,field:{...S.field},items:S.items.map(i=>({...i,numbers:(i.numbers||[]).map(n=>({...n}))})),annotations:S.annotations.map(x=>({...x})),title:S.title,nextNumber:S.nextNumber,background:{...S.background}}}
function snap(){return JSON.stringify(project())}
function hist(){if(S.restoring)return;const s=snap();if(S.undo[S.undo.length-1]!==s){S.undo.push(s);if(S.undo.length>100)S.undo.shift()}S.redo=[];undoUI()}
function normalizeItem(x){
  const i={...x};
  if(Array.isArray(i.numbers)) i.numbers=i.numbers.map((n,k)=>({id:n.id||('n'+Date.now()+k+Math.random().toString(36).slice(2,5)),value:Number(n.value??n.num)||null,suffix:n.suffix||'',dx:Number.isFinite(n.dx)?n.dx:null,dy:Number.isFinite(n.dy)?n.dy:null}));
  else {
    i.numbers=[];
    if(i.num){
      const pos=legacyNumberPosition(i);
      const off=worldOffsetToLocal(i,pos.x-i.x,pos.y-i.y);
      i.numbers.push({id:'n'+Date.now()+Math.random().toString(36).slice(2,5),value:Number(i.num),suffix:i.suffix||'',dx:off.dx,dy:off.dy});
    }
  }
  delete i.num;delete i.suffix;delete i.numX;delete i.numY;
  return i;
}
function restore(o){if(typeof o==='string')o=JSON.parse(o);S.restoring=true;S.field={w:20,h:40,unit:'m',showGrid:true,showAxes:false,snap:false,grid:2,...o.field};S.items=(o.items||[]).map(normalizeItem);S.annotations=(o.annotations||o.lines||[]).map(x=>({...x,type:x.type||'line'}));S.title=o.title||'Untitled Course';S.nextNumber=o.nextNumber||1;S.background={src:null,opacity:.35,...(o.background||{})};S.selected=null;S.selectedKind=null;S.selectedNumberId=null;loadBg(S.background.src,()=>{sync();fit();draw()});sync();fit();selUI();S.restoring=false}
function undo(){if(S.undo.length<2)return;S.redo.push(S.undo.pop());restore(S.undo[S.undo.length-1]);undoUI()}
function redo(){if(!S.redo.length)return;const n=S.redo.pop();S.undo.push(n);restore(n);undoUI()}
function undoUI(){$('undoBtn').disabled=S.undo.length<2;$('redoBtn').disabled=!S.redo.length}

function m(v){return S.field.unit==='m'?Number(v):Number(v)*.3048}
function fm(){return{w:m(S.field.w),h:m(S.field.h)}}
function du(v){return S.field.unit==='m'?v:v/.3048}
function sync(){$('fieldWidth').value=S.field.w;$('fieldHeight').value=S.field.h;$('gridToggle').checked=S.field.showGrid;$('axisToggle').checked=S.field.showAxes;$('snapToggle').checked=S.field.snap;$('gridSpacing').value=S.field.grid;$('courseTitle').value=S.title;$('autoNumberToggle').checked=S.autoNumber;$('backgroundOpacity').value=Math.round(S.background.opacity*100);$('backgroundOpacityValue').textContent=Math.round(S.background.opacity*100)+'%';document.querySelectorAll('#unitControl .seg').forEach(b=>b.classList.toggle('active',b.dataset.unit===S.field.unit))}
function view(){const r=wrap.getBoundingClientRect(),f=fm(),p=S.field.showAxes?42:20;let aw=Math.max(120,r.width-p*2),ah=Math.max(120,r.height-p*2),w,h;if(aw/ah>f.w/f.h){h=ah;w=h*f.w/f.h}else{w=aw;h=w*f.h/f.w}w*=S.zoom;h*=S.zoom;V={left:(r.width-w)/2+S.pan.x,top:(r.height-h)/2+S.pan.y,width:w,height:h,scale:w/f.w};$('zoomLabel').textContent=Math.round(S.zoom*100)+'%'}
function resize(){const r=wrap.getBoundingClientRect();canvas.style.width=r.width+'px';canvas.style.height=r.height+'px';canvas.width=Math.max(1,Math.round(r.width*dpr));canvas.height=Math.max(1,Math.round(r.height*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);view();draw()}
function fit(){S.zoom=1;S.pan={x:0,y:0};resize()}
function ws(x,y){return{x:V.left+x*V.scale,y:V.top+y*V.scale}}
function sw(x,y){return{x:(x-V.left)/V.scale,y:(y-V.top)/V.scale}}
function clamp(p){const f=fm();return{x:Math.max(0,Math.min(f.w,p.x)),y:Math.max(0,Math.min(f.h,p.y))}}
function snp(p){if(!S.field.snap)return p;const g=m(S.field.grid||1);return{x:Math.round(p.x/g)*g,y:Math.round(p.y/g)*g}}

function draw(){const r=wrap.getBoundingClientRect();ctx.clearRect(0,0,r.width,r.height);view();ctx.fillStyle=C.field;ctx.fillRect(V.left,V.top,V.width,V.height);if(S.backgroundImage){ctx.save();ctx.globalAlpha=S.background.opacity;ctx.drawImage(S.backgroundImage,V.left,V.top,V.width,V.height);ctx.restore()}grid(ctx,S.field.showGrid,S.field.showAxes);ctx.save();ctx.beginPath();ctx.rect(V.left,V.top,V.width,V.height);ctx.clip();S.annotations.forEach(a=>ann(ctx,a,a.id===S.selected&&S.selectedKind==='annotation'));S.items.forEach(i=>item(ctx,i,i.id===S.selected&&S.selectedKind==='item'));if(S.drawing)ann(ctx,S.drawing,false,true);ctx.restore();ctx.strokeStyle='#c7cbc5';ctx.lineWidth=1;ctx.strokeRect(V.left+.5,V.top+.5,V.width-1,V.height-1);empty.style.display=(S.items.length||S.annotations.length||S.background.src)?'none':'flex'}
function grid(c,show,axes){const f=fm(),g=m(S.field.grid||1);if(show){c.save();c.strokeStyle=C.grid;c.globalAlpha=.18;c.lineWidth=1;c.beginPath();for(let x=g;x<f.w-.001;x+=g){const p=ws(x,0);c.moveTo(p.x,V.top);c.lineTo(p.x,V.top+V.height)}for(let y=g;y<f.h-.001;y+=g){const p=ws(0,y);c.moveTo(V.left,p.y);c.lineTo(V.left+V.width,p.y)}c.stroke();c.restore()}if(axes){const step=Math.max(g,f.w>35||f.h>55?5:2);c.save();c.fillStyle='#687273';c.font='600 10px Inter,sans-serif';c.textAlign='center';c.textBaseline='top';for(let x=0;x<=f.w+.001;x+=step){const p=ws(x,0);c.fillText(Math.round(du(x))+(S.field.unit==='m'?'m':'ft'),p.x,V.top+V.height+7)}c.textAlign='right';c.textBaseline='middle';for(let y=0;y<=f.h+.001;y+=step){const p=ws(0,y);c.fillText(Math.round(du(y))+(S.field.unit==='m'?'m':'ft'),V.left-7,p.y)}c.restore()}}
function rr(c,x,y,w,h,r){if(c.roundRect)c.roundRect(x,y,w,h,r);else{c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r)}}
function legacyNumberPosition(i){if(Number.isFinite(i.numX)&&Number.isFinite(i.numY))return{x:i.numX,y:i.numY};const d=Math.max(i.w,i.h)/2+.75,a=((i.rot||0)-90)*Math.PI/180;return{x:i.x+Math.cos(a)*d,y:i.y+Math.sin(a)*d}}
function localOffsetToWorld(i,dx,dy){const a=(i.rot||0)*Math.PI/180;return{x:dx*Math.cos(a)-dy*Math.sin(a),y:dx*Math.sin(a)+dy*Math.cos(a)}}
function worldOffsetToLocal(i,dx,dy){const a=-(i.rot||0)*Math.PI/180;return{dx:dx*Math.cos(a)-dy*Math.sin(a),dy:dx*Math.sin(a)+dy*Math.cos(a)}}
function defaultNumberOffset(i,index=0){const d=Math.max(i.w,i.h)/2+.75,a=-Math.PI/2+(index%4)*Math.PI/2;return{dx:Math.cos(a)*d,dy:Math.sin(a)*d}}
function markerPosition(i,n,index=0){const base=Number.isFinite(n.dx)&&Number.isFinite(n.dy)?{dx:n.dx,dy:n.dy}:defaultNumberOffset(i,index);const off=localOffsetToWorld(i,base.dx,base.dy);return{x:i.x+off.x,y:i.y+off.y}}
function item(c,i,sel){
  const p=ws(i.x,i.y),sc=V.scale,w=i.w*sc,h=i.h*sc,a=(i.rot||0)*Math.PI/180;
  c.save();c.translate(p.x,p.y);c.rotate(a);c.lineCap='round';c.lineJoin='round';
  if(sel){c.save();c.strokeStyle=C.teal;c.setLineDash([5,4]);c.lineWidth=2;c.strokeRect(-w/2-7,-h/2-7,w+14,h+14);c.restore()}
  if(i.type==='jump'||i.type==='redjump')standardJump(c,w,h,i.type==='redjump'?C.red:'#263033');
  else if(i.type==='double'||i.type==='triple')standardMulti(c,w,h,i.type==='double'?2:3);
  else if(i.type==='wall')standardWall(c,w,h);
  else if(i.type==='tire')standardTire(c,w,h);
  else if(i.type==='longjump')standardLongJump(c,w,h);
  else if(i.type==='weaves')standardWeaves(c,w,h);
  else if(i.type==='dogwalk')standardDogwalk(c,w,h);
  else if(i.type==='aframe')standardAframe(c,w,h);
  else if(i.type==='teeter')standardTeeter(c,w,h);
  else if(i.type==='tunnel')standardTunnel(c,w,i.curve??.35);
  else if(i.type==='table')standardTable(c,w,h);
  else if(i.type==='arrow')standardArrow(c,w,h);
  else if(i.type==='start')standardMarker(c,w,h,'S');
  else if(i.type==='finish')standardMarker(c,w,h,'F');
  else if(i.type==='startfinish')standardStartFinish(c,w,h);
  c.restore();
  (i.numbers||[]).forEach((n,index)=>{
    if(!n.value)return;const pos=markerPosition(i,n,index),q=ws(pos.x,pos.y),lab=String(n.value)+(n.suffix||'');
    const active=sel&&S.selectedNumberId===n.id,fs=Math.max(12,Math.min(34,V.scale*.48)),padX=Math.max(6,fs*.42),boxH=Math.max(22,fs*1.42),rad=Math.max(7,fs*.42);
    c.save();c.font='700 '+fs+'px Inter,sans-serif';const tw=c.measureText(lab).width;
    c.fillStyle=C.field;c.strokeStyle=active?C.teal:'#4b5656';c.lineWidth=active?2:Math.max(1,fs*.055);
    c.beginPath();rr(c,q.x-tw/2-padX,q.y-boxH/2,tw+padX*2,boxH,rad);c.fill();c.stroke();
    c.fillStyle='#152020';c.textAlign='center';c.textBaseline='middle';c.fillText(lab,q.x,q.y+.5);c.restore();
  });
}
function symbolInk(c){c.strokeStyle='#1D2425';c.fillStyle='#D6D9D7';c.lineWidth=2}
function standardJump(c,w,h,col){
  const bar=Math.max(3,Math.min(7,h*.7)),post=Math.max(5,Math.min(12,w*.07)),wing=Math.max(4,Math.min(10,h*1.8));
  c.fillStyle=col;c.strokeStyle='#1D2425';c.lineWidth=1.6;
  c.fillRect(-w*.38,-bar/2,w*.76,bar);c.strokeRect(-w*.38,-bar/2,w*.76,bar);
  c.fillStyle='#D6D9D7';
  c.fillRect(-w/2,-wing/2,post,wing);c.strokeRect(-w/2,-wing/2,post,wing);
  c.fillRect(w/2-post,-wing/2,post,wing);c.strokeRect(w/2-post,-wing/2,post,wing);
}
function standardMulti(c,w,h,n){
  const ink='#1D2425',barH=Math.max(3,Math.min(6,h/(n*2.2))),span=w*.72,post=Math.max(5,Math.min(11,w*.06));
  c.strokeStyle=ink;c.fillStyle='#ECEDEB';c.lineWidth=1.6;
  for(let k=0;k<n;k++){const y=n===1?0:(-h*.32+k*(h*.64/(n-1)));c.fillRect(-span/2,y-barH/2,span,barH);c.strokeRect(-span/2,y-barH/2,span,barH)}
  c.fillStyle='#D6D9D7';c.fillRect(-w/2,-h*.38,post,h*.76);c.strokeRect(-w/2,-h*.38,post,h*.76);c.fillRect(w/2-post,-h*.38,post,h*.76);c.strokeRect(w/2-post,-h*.38,post,h*.76);
}
function standardWall(c,w,h){
  const ink='#1D2425',block=Math.max(6,Math.min(12,h*1.8)),bar=Math.max(3,Math.min(7,h*.7));
  c.strokeStyle=ink;c.lineWidth=1.7;c.fillStyle='#B8BEBC';
  c.fillRect(-w/2,-block/2,block,block);c.strokeRect(-w/2,-block/2,block,block);
  c.fillRect(w/2-block,-block/2,block,block);c.strokeRect(w/2-block,-block/2,block,block);
  c.fillStyle='#D6D9D7';c.fillRect(-w/2+block,-bar/2,w-2*block,bar);c.strokeRect(-w/2+block,-bar/2,w-2*block,bar);
}
function standardTire(c,w,h){
  const ink='#1D2425',r=Math.max(7,Math.min(w*.22,Math.max(h*3,11))),postH=r*2.3;
  c.strokeStyle=ink;c.lineWidth=2;
  c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.stroke();
  c.beginPath();c.moveTo(-r-8,-postH/2);c.lineTo(-r-8,postH/2);c.moveTo(r+8,-postH/2);c.lineTo(r+8,postH/2);c.stroke();
  c.strokeStyle='#6E7776';c.lineWidth=1.4;c.beginPath();c.moveTo(-w/2,0);c.lineTo(-r-8,0);c.moveTo(r+8,0);c.lineTo(w/2,0);c.stroke();
}
function standardLongJump(c,w,h){
  const ink='#1D2425',n=5,plankH=Math.max(3,Math.min(7,h*.08));
  c.strokeStyle=ink;c.fillStyle='#D6D9D7';c.lineWidth=1.5;
  for(let k=0;k<n;k++){const y=-h*.36+k*(h*.72/(n-1));c.fillRect(-w*.32,y-plankH/2,w*.64,plankH);c.strokeRect(-w*.32,y-plankH/2,w*.64,plankH)}
  c.fillStyle=ink;const r=Math.max(2.2,Math.min(3.8,w*.055));[[-w*.42,-h*.43],[w*.42,-h*.43],[-w*.42,h*.43],[w*.42,h*.43]].forEach(([x,y])=>{c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill()});
}
function standardWeaves(c,w,h){
  c.fillStyle='#1D2425';const n=12,r=Math.max(2.2,Math.min(4,V.scale*.12));
  for(let k=0;k<n;k++){const y=-h/2+k*h/(n-1);c.beginPath();c.arc(0,y,r,0,Math.PI*2);c.fill()}
}
function standardDogwalk(c,w,h){
  const ink='#1D2425',contact=Math.max(h*.1,8);
  c.strokeStyle=ink;c.fillStyle='#ECEDEB';c.lineWidth=1.7;c.fillRect(-w/2,-h/2,w,h);c.strokeRect(-w/2,-h/2,w,h);
  c.fillStyle='rgba(75,131,166,.32)';c.fillRect(-w/2,-h/2,w,contact);c.fillRect(-w/2,h/2-contact,w,contact);
  c.strokeStyle=ink;c.beginPath();c.moveTo(-w/2,-h*.22);c.lineTo(w/2,-h*.22);c.moveTo(-w/2,h*.22);c.lineTo(w/2,h*.22);c.stroke();
  c.fillStyle=ink;const s=Math.max(3,Math.min(6,w*.2));c.fillRect(-s/2,-h*.23-s*1.6,s,s*3.2);c.fillRect(-s/2,h*.23-s*1.6,s,s*3.2);
}
function standardAframe(c,w,h){
  const ink='#1D2425';c.strokeStyle=ink;c.fillStyle='#ECEDEB';c.lineWidth=1.7;c.fillRect(-w/2,-h/2,w,h);c.strokeRect(-w/2,-h/2,w,h);
  c.fillStyle='rgba(75,131,166,.32)';c.fillRect(-w/2,-h/2,w,h*.18);c.fillRect(-w/2,h/2-h*.18,w,h*.18);
  c.strokeStyle=ink;[-.25,0,.25].forEach(t=>{c.beginPath();c.moveTo(-w/2,h*t*2);c.lineTo(w/2,h*t*2);c.stroke()});
}
function standardTeeter(c,w,h){
  const ink='#1D2425';c.strokeStyle=ink;c.fillStyle='#ECEDEB';c.lineWidth=1.7;c.fillRect(-w/2,-h/2,w,h);c.strokeRect(-w/2,-h/2,w,h);
  c.fillStyle='rgba(75,131,166,.30)';c.fillRect(-w/2,-h/2,w,h*.16);c.fillRect(-w/2,h/2-h*.16,w,h*.16);
  c.strokeStyle=ink;c.beginPath();c.moveTo(-w/2,0);c.lineTo(w/2,0);c.stroke();
  const s=Math.max(4,Math.min(8,w*.22));c.fillStyle='#B8BEBC';c.fillRect(-s/2,-s/2,s,s);c.strokeRect(-s/2,-s/2,s,s);
}
function standardTunnel(c,w,curve){
  const b=Math.max(-1,Math.min(1,curve))*w*.45,thick=Math.max(11,V.scale*.82);
  c.strokeStyle='#1D2425';c.lineWidth=thick+4;c.beginPath();c.moveTo(-w/2,0);c.quadraticCurveTo(0,b,w/2,0);c.stroke();
  c.strokeStyle='rgba(213,147,69,.48)';c.lineWidth=thick;c.beginPath();c.moveTo(-w/2,0);c.quadraticCurveTo(0,b,w/2,0);c.stroke();
}
function standardTable(c,w,h){
  const ink='#1D2425';c.strokeStyle=ink;c.fillStyle='#ECEDEB';c.lineWidth=1.8;c.fillRect(-w/2,-h/2,w,h);c.strokeRect(-w/2,-h/2,w,h);
  c.fillStyle=ink;c.font='700 '+Math.max(10,Math.min(18,Math.min(w,h)*.55))+'px Inter,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText('T',0,1);
}
function standardArrow(c,w,h){
  const ink='#1D2425',shaft=Math.max(2,Math.min(4,w*.045)),head=Math.max(8,Math.min(18,h*.9));
  c.strokeStyle=ink;c.fillStyle=ink;c.lineWidth=shaft;c.lineCap='round';c.lineJoin='round';
  c.beginPath();c.moveTo(-w/2,0);c.lineTo(w/2-head*.65,0);c.stroke();
  c.beginPath();c.moveTo(w/2,0);c.lineTo(w/2-head,head*.65);c.lineTo(w/2-head,-head*.65);c.closePath();c.fill();
}
function standardMarker(c,w,h,label){
  const ink='#1D2425',r=Math.max(10,Math.min(26,Math.min(w,h)*.42));
  c.strokeStyle=ink;c.fillStyle=C.field;c.lineWidth=Math.max(1.8,Math.min(3,r*.12));
  c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.fill();c.stroke();
  c.fillStyle=ink;c.font='700 '+Math.max(12,Math.min(26,r*1.08))+'px Inter,sans-serif';c.textAlign='center';c.textBaseline='middle';
  c.fillText(label,0,1);
}
function standardStartFinish(c,w,h){
  const ink='#1D2425',r=Math.max(10,Math.min(24,h*.42)),x=Math.max(r+6,w/2-r-3);
  c.strokeStyle=ink;c.fillStyle=C.field;c.lineWidth=Math.max(1.8,Math.min(3,r*.12));
  c.beginPath();c.moveTo(-x+r,0);c.lineTo(x-r,0);c.stroke();
  [-x,x].forEach(cx=>{c.beginPath();c.arc(cx,0,r,0,Math.PI*2);c.fill();c.stroke()});
  c.fillStyle=ink;c.font='700 '+Math.max(12,Math.min(24,r*1.05))+'px Inter,sans-serif';c.textAlign='center';c.textBaseline='middle';
  c.fillText('S',-x,1);c.fillText('F',x,1);
}
function qp(x0,y0,cx,cy,x1,y1,t){const z=1-t;return{x:z*z*x0+2*z*t*cx+t*t*x1,y:z*z*y0+2*z*t*cy+t*t*y1}}
function ann(c,a,sel,preview){c.save();c.strokeStyle=C.red;c.fillStyle='rgba(217,75,75,.13)';c.lineWidth=3;c.setLineDash(a.dashed?[9,6]:[]);if(a.type==='zone'){const p=ws(a.x1,a.y1),q=ws(a.x2,a.y2),x=Math.min(p.x,q.x),y=Math.min(p.y,q.y),w=Math.abs(q.x-p.x),h=Math.abs(q.y-p.y);c.fillRect(x,y,w,h);c.strokeRect(x,y,w,h)}else if(a.type==='label'){const p=ws(a.x1,a.y1);c.setLineDash([]);c.fillStyle=C.red;c.font='800 13px Inter,sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(a.text||'GAMBLE',p.x,p.y)}else{const p=ws(a.x1,a.y1),q=ws(a.x2,a.y2);c.beginPath();c.moveTo(p.x,p.y);c.lineTo(q.x,q.y);c.stroke()}if(sel&&!preview){c.setLineDash([]);c.strokeStyle=C.teal;c.fillStyle=C.field;const hs=a.type==='label'?[{x:a.x1,y:a.y1}]:[{x:a.x1,y:a.y1},{x:a.x2,y:a.y2}];hs.forEach(h=>{const p=ws(h.x,h.y);c.beginPath();c.arc(p.x,p.y,6,0,Math.PI*2);c.fill();c.stroke()})}c.restore()}
function dist(p,a,b){const vx=b.x-a.x,vy=b.y-a.y,wx=p.x-a.x,wy=p.y-a.y,c1=vx*wx+vy*wy;if(c1<=0)return Math.hypot(p.x-a.x,p.y-a.y);const c2=vx*vx+vy*vy;if(c2<=c1)return Math.hypot(p.x-b.x,p.y-b.y);const t=c1/c2;return Math.hypot(p.x-(a.x+t*vx),p.y-(a.y+t*vy))}

function add(type){hist();const f=fm(),d=defs[type],i={id:'i'+Date.now()+Math.random().toString(36).slice(2,5),type,x:f.w/2,y:f.h/2,rot:0,w:d.w,h:d.h,curve:d.curve??0,numbers:[]};if(S.autoNumber){const o=defaultNumberOffset(i,0);i.numbers.push({id:'n'+Date.now()+Math.random().toString(36).slice(2,5),value:S.nextNumber++,suffix:'',dx:o.dx,dy:o.dy})}S.items.push(i);S.selected=i.id;S.selectedKind='item';S.selectedNumberId=i.numbers[0]?.id||null;tool('select');hist();selUI();draw();toast(names[type]+' added')}
function hitNum(p){for(let a=S.items.length-1;a>=0;a--){const i=S.items[a];for(let b=(i.numbers||[]).length-1;b>=0;b--){const n=i.numbers[b];if(!n.value)continue;const q=markerPosition(i,n,b);if(Math.hypot(p.x-q.x,p.y-q.y)<Math.max(.45,12/V.scale))return{item:i,marker:n,index:b}}}return null}
function hitItem(p){for(let n=S.items.length-1;n>=0;n--){const i=S.items[n],dx=p.x-i.x,dy=p.y-i.y,a=-(i.rot||0)*Math.PI/180,lx=dx*Math.cos(a)-dy*Math.sin(a),ly=dx*Math.sin(a)+dy*Math.cos(a);if(i.type==='tunnel'){const b=(i.curve||0)*i.w*.45;let best=999,prev={x:-i.w/2,y:0};for(let t=.05;t<=1;t+=.05){const cur=qp(-i.w/2,0,0,b,i.w/2,0,t);best=Math.min(best,dist({x:lx,y:ly},prev,cur));prev=cur}if(best<.72)return i}else if(Math.abs(lx)<=i.w/2+.5&&Math.abs(ly)<=i.h/2+.5)return i}return null}
function hitAnn(p){for(let n=S.annotations.length-1;n>=0;n--){const a=S.annotations[n];if(a.type==='label'&&Math.hypot(p.x-a.x1,p.y-a.y1)<.8)return a;if(a.type==='zone'){const x1=Math.min(a.x1,a.x2),x2=Math.max(a.x1,a.x2),y1=Math.min(a.y1,a.y2),y2=Math.max(a.y1,a.y2);if(p.x>=x1-.3&&p.x<=x2+.3&&p.y>=y1-.3&&p.y<=y2+.3)return a}else if(a.type!=='label'&&dist(p,{x:a.x1,y:a.y1},{x:a.x2,y:a.y2})<.45)return a}return null}
function cp(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
function inside(s){return s.x>=V.left&&s.x<=V.left+V.width&&s.y>=V.top&&s.y<=V.top+V.height}
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture?.(e.pointerId);S.pointers.set(e.pointerId,cp(e));if(S.pointers.size===2){const p=[...S.pointers.values()];S.pinch={dist:Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y),zoom:S.zoom};S.drag=null;return}const s=cp(e),p=clamp(sw(s.x,s.y));if(S.tool==='pan'){S.drag={kind:'pan',start:s,pan:{...S.pan}};return}if(['line','dash','zone'].includes(S.tool)&&inside(s)){hist();const q=snp(p);S.drawing={id:'a'+Date.now(),type:S.tool==='zone'?'zone':'line',dashed:S.tool==='dash',x1:q.x,y1:q.y,x2:q.x,y2:q.y};draw();return}if(S.tool==='label'&&inside(s)){const t=prompt('Label text','GAMBLE');if(t){hist();const q=snp(p);S.annotations.push({id:'a'+Date.now(),type:'label',text:t.trim()||'GAMBLE',x1:q.x,y1:q.y});hist();draw()}return}if(!inside(s)){S.drag={kind:'pan',start:s,pan:{...S.pan}};return}const n=hitNum(p);if(n){S.selected=n.item.id;S.selectedKind='item';S.selectedNumberId=n.marker.id;S.drag={kind:'number',id:n.item.id,numberId:n.marker.id};selUI();draw();return}const i=hitItem(p);if(i){S.selected=i.id;S.selectedKind='item';S.selectedNumberId=null;S.drag={kind:'item',id:i.id,off:{x:p.x-i.x,y:p.y-i.y}};selUI();draw();return}const a=hitAnn(p);if(a){S.selected=a.id;S.selectedKind='annotation';S.selectedNumberId=null;const cx=a.type==='label'?a.x1:(a.x1+a.x2)/2,cy=a.type==='label'?a.y1:(a.y1+a.y2)/2;S.drag={kind:'annotation',id:a.id,off:{x:p.x-cx,y:p.y-cy}};selUI();draw();return}S.selected=null;S.selectedKind=null;S.selectedNumberId=null;selUI();S.drag={kind:'pan',start:s,pan:{...S.pan}};draw()});
canvas.addEventListener('pointermove',e=>{if(S.pointers.has(e.pointerId))S.pointers.set(e.pointerId,cp(e));if(S.pointers.size===2&&S.pinch){const p=[...S.pointers.values()],d=Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y);S.zoom=Math.max(.45,Math.min(4,S.pinch.zoom*d/S.pinch.dist));view();draw();return}const s=cp(e),p=snp(clamp(sw(s.x,s.y)));if(S.drawing){S.drawing.x2=p.x;S.drawing.y2=p.y;draw();return}if(!S.drag)return;if(S.drag.kind==='pan'){S.pan={x:S.drag.pan.x+s.x-S.drag.start.x,y:S.drag.pan.y+s.y-S.drag.start.y};view();draw();return}if(S.drag.kind==='number'){const i=S.items.find(x=>x.id===S.drag.id);if(i){const n=(i.numbers||[]).find(x=>x.id===S.drag.numberId);if(n){const off=worldOffsetToLocal(i,p.x-i.x,p.y-i.y);n.dx=off.dx;n.dy=off.dy;draw()}}return}if(S.drag.kind==='item'){const i=S.items.find(x=>x.id===S.drag.id);if(i){i.x=p.x-S.drag.off.x;i.y=p.y-S.drag.off.y;const f=fm();i.x=Math.max(0,Math.min(f.w,i.x));i.y=Math.max(0,Math.min(f.h,i.y));draw()}return}if(S.drag.kind==='annotation'){const a=S.annotations.find(x=>x.id===S.drag.id);if(!a)return;const cx=a.type==='label'?a.x1:(a.x1+a.x2)/2,cy=a.type==='label'?a.y1:(a.y1+a.y2)/2,nx=p.x-S.drag.off.x,ny=p.y-S.drag.off.y,dx=nx-cx,dy=ny-cy;a.x1+=dx;a.y1+=dy;if(a.type!=='label'){a.x2+=dx;a.y2+=dy}draw()}});
function pend(e){S.pointers.delete(e.pointerId);if(S.pointers.size<2)S.pinch=null;if(S.drawing){const a=S.drawing;S.drawing=null;if(Math.hypot(a.x2-a.x1,a.y2-a.y1)>.2){S.annotations.push(a);S.selected=a.id;S.selectedKind='annotation';hist();selUI()}draw()}else if(S.drag){const k=S.drag.kind;S.drag=null;if(k!=='pan')hist()}}
canvas.addEventListener('pointerup',pend);canvas.addEventListener('pointercancel',pend);canvas.addEventListener('wheel',e=>{e.preventDefault();S.zoom=Math.max(.45,Math.min(4,S.zoom*(e.deltaY>0?.92:1.08)));view();draw()},{passive:false});

function si(){return S.selectedKind==='item'?S.items.find(x=>x.id===S.selected):null}
function sa(){return S.selectedKind==='annotation'?S.annotations.find(x=>x.id===S.selected):null}
function selectedMarker(i){return i?(i.numbers||[]).find(n=>n.id===S.selectedNumberId)||null:null}
function renderNumberList(i){
  const list=$('numberList');list.innerHTML='';
  (i.numbers||[]).forEach((n,index)=>{
    const b=document.createElement('button');b.type='button';b.className='tool-btn'+(n.id===S.selectedNumberId?' active':'');
    b.textContent=(n.value?String(n.value):'—')+(n.suffix||'');
    b.onclick=()=>{S.selectedNumberId=n.id;selUI();draw()};
    list.appendChild(b);
  });
  $('numberEditor').hidden=!selectedMarker(i);
}
function selUI(){
  const i=si(),a=sa(),yes=!!(i||a);
  $('noSelection').hidden=yes;$('selectionControls').hidden=!yes;
  if(!yes)return;
  $('selectionName').textContent=i?names[i.type]:(a.type==='zone'?'Red zone':a.type==='label'?'Red label':'Red line');
  $('itemControls').hidden=!i;$('annotationControls').hidden=!a;
  if(i){
    $('rotationSlider').value=i.rot||0;$('rotationValue').textContent=Math.round(i.rot||0)+'°';
    $('widthSlider').value=i.w;$('widthValue').textContent=Number(i.w).toFixed(1);
    $('heightSlider').value=i.h;$('heightValue').textContent=Number(i.h).toFixed(1);
    $('sizeControls').hidden=i.type==='tunnel';$('tunnelControls').hidden=i.type!=='tunnel';
    if(i.type==='tunnel'){$('tunnelLengthSlider').value=i.w;$('tunnelLengthValue').textContent=Number(i.w).toFixed(2);$('tunnelCurveSlider').value=Math.round((i.curve||0)*100);$('tunnelCurveValue').textContent=Math.round((i.curve||0)*100)+'%'}
    renderNumberList(i);
    const n=selectedMarker(i);
    $('numberInput').value=n?.value??'';$('suffixSelect').value=n?.suffix||'';
  }
  if(a)$('annotationDashToggle').checked=!!a.dashed;
}
function tool(t){S.tool=t;const map={select:'selectToolBtn',pan:'panToolBtn',line:'lineToolBtn',dash:'dashToolBtn',zone:'zoneToolBtn',label:'labelToolBtn'};Object.values(map).forEach(id=>$(id).classList.remove('active'));$(map[t]||map.select).classList.add('active')}

document.querySelectorAll('[data-type]').forEach(b=>b.onclick=()=>add(b.dataset.type));$('selectToolBtn').onclick=()=>tool('select');$('panToolBtn').onclick=()=>tool('pan');$('lineToolBtn').onclick=()=>tool('line');$('dashToolBtn').onclick=()=>tool('dash');$('zoneToolBtn').onclick=()=>tool('zone');$('labelToolBtn').onclick=()=>tool('label');$('undoBtn').onclick=undo;$('redoBtn').onclick=redo;$('fitBtn').onclick=fit;$('zoomInBtn').onclick=()=>{S.zoom=Math.min(4,S.zoom*1.15);resize()};$('zoomOutBtn').onclick=()=>{S.zoom=Math.max(.45,S.zoom/1.15);resize()};
function focus(on){document.body.classList.toggle('focus',on??!document.body.classList.contains('focus'));setTimeout(resize,60)}$('focusBtn').onclick=()=>focus();$('exitFocusBtn').onclick=()=>focus(false);

function field(){hist();S.field.w=Math.max(5,Number($('fieldWidth').value)||20);S.field.h=Math.max(5,Number($('fieldHeight').value)||40);hist();fit()}$('fieldWidth').onchange=field;$('fieldHeight').onchange=field;
document.querySelectorAll('#unitControl .seg').forEach(b=>b.onclick=()=>{if(b.dataset.unit===S.field.unit)return;hist();const w=m(S.field.w),h=m(S.field.h);S.field.unit=b.dataset.unit;S.field.w=+(S.field.unit==='m'?w:w/.3048).toFixed(1);S.field.h=+(S.field.unit==='m'?h:h/.3048).toFixed(1);sync();hist();fit()});
$('gridToggle').onchange=e=>{hist();S.field.showGrid=e.target.checked;hist();draw()};$('axisToggle').onchange=e=>{hist();S.field.showAxes=e.target.checked;hist();fit()};$('snapToggle').onchange=e=>S.field.snap=e.target.checked;$('gridSpacing').onchange=e=>{S.field.grid=Number(e.target.value);draw()};$('courseTitle').onchange=e=>{hist();S.title=e.target.value.trim()||'Untitled Course';hist()};
function range(id,fn){$(id).addEventListener('input',fn);$(id).addEventListener('change',hist)}
range('rotationSlider',e=>{const i=si();if(i){i.rot=Number(e.target.value);$('rotationValue').textContent=i.rot+'°';draw()}});range('widthSlider',e=>{const i=si();if(i&&i.type!=='tunnel'){i.w=Math.max(.2,Number(e.target.value));$('widthValue').textContent=i.w.toFixed(1);draw()}});range('heightSlider',e=>{const i=si();if(i&&i.type!=='tunnel'){i.h=Math.max(.2,Number(e.target.value));$('heightValue').textContent=i.h.toFixed(1);draw()}});range('tunnelLengthSlider',e=>{const i=si();if(i){i.w=Number(e.target.value);$('tunnelLengthValue').textContent=i.w.toFixed(2);draw()}});range('tunnelCurveSlider',e=>{const i=si();if(i){i.curve=Number(e.target.value)/100;$('tunnelCurveValue').textContent=e.target.value+'%';draw()}});
$('addNumberBtn').onclick=()=>{const i=si();if(!i)return;hist();const index=(i.numbers||[]).length,o=defaultNumberOffset(i,index),n={id:'n'+Date.now()+Math.random().toString(36).slice(2,5),value:S.nextNumber++,suffix:'',dx:o.dx,dy:o.dy};i.numbers=i.numbers||[];i.numbers.push(n);S.selectedNumberId=n.id;hist();selUI();draw()};
$('numberInput').onchange=e=>{const i=si(),n=selectedMarker(i);if(!i||!n)return;hist();n.value=e.target.value?Number(e.target.value):null;if(n.value)S.nextNumber=Math.max(S.nextNumber,n.value+1);hist();selUI();draw()};
$('suffixSelect').onchange=e=>{const i=si(),n=selectedMarker(i);if(!i||!n)return;hist();n.suffix=e.target.value;hist();selUI();draw()};
$('autoNumberToggle').onchange=e=>S.autoNumber=e.target.checked;
$('resetNumberPosBtn').onclick=()=>{const i=si(),n=selectedMarker(i);if(!i||!n)return;hist();const idx=(i.numbers||[]).findIndex(x=>x.id===n.id),o=defaultNumberOffset(i,Math.max(0,idx));n.dx=o.dx;n.dy=o.dy;hist();draw()};
$('deleteNumberBtn').onclick=()=>{const i=si(),n=selectedMarker(i);if(!i||!n)return;hist();i.numbers=(i.numbers||[]).filter(x=>x.id!==n.id);S.selectedNumberId=i.numbers[0]?.id||null;hist();selUI();draw()};
$('annotationDashToggle').onchange=e=>{const a=sa();if(a){hist();a.dashed=e.target.checked;hist();draw()}};
$('duplicateBtn').onclick=()=>{if(!S.selected)return;hist();if(S.selectedKind==='item'){const i=si(),c={...i,id:'i'+Date.now(),x:i.x+.5,y:i.y+.5,numbers:[]};if(S.autoNumber){const o=defaultNumberOffset(c,0);c.numbers=[{id:'n'+Date.now()+Math.random().toString(36).slice(2,5),value:S.nextNumber++,suffix:'',dx:o.dx,dy:o.dy}]}S.items.push(c);S.selected=c.id;S.selectedNumberId=c.numbers[0]?.id||null}else{const a=sa(),c={...a,id:'a'+Date.now(),x1:a.x1+.5,y1:a.y1+.5};if(a.type!=='label'){c.x2=a.x2+.5;c.y2=a.y2+.5}S.annotations.push(c);S.selected=c.id}hist();selUI();draw()};$('deleteBtn').onclick=()=>{if(!S.selected)return;hist();if(S.selectedKind==='item')S.items=S.items.filter(x=>x.id!==S.selected);else S.annotations=S.annotations.filter(x=>x.id!==S.selected);S.selected=null;S.selectedKind=null;S.selectedNumberId=null;hist();selUI();draw()};

function loadBg(src,done){S.backgroundImage=null;if(!src){done?.();return}const i=new Image();i.onload=()=>{S.backgroundImage=i;done?.();draw()};i.onerror=()=>done?.();i.src=src}
$('backgroundImportBtn').onclick=()=>$('backgroundFile').click();$('backgroundFile').onchange=e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{hist();S.background.src=r.result;loadBg(r.result,()=>{hist();draw();toast('Background map imported')})};r.readAsDataURL(f);e.target.value=''};$('backgroundOpacity').oninput=e=>{S.background.opacity=Number(e.target.value)/100;$('backgroundOpacityValue').textContent=e.target.value+'%';draw()};$('backgroundOpacity').onchange=hist;$('backgroundClearBtn').onclick=()=>{if(S.background.src){hist();S.background.src=null;S.backgroundImage=null;hist();draw();toast('Background cleared')}};

function saved(){try{return JSON.parse(localStorage.getItem('runlineStudioCourses')||'{}')}catch{return{}}}
function refresh(){const s=$('savedCourses'),a=saved();s.innerHTML='';const n=Object.keys(a).sort((x,y)=>(a[y].savedAt||'').localeCompare(a[x].savedAt||''));if(!n.length)s.add(new Option('No saved courses',''));else n.forEach(x=>s.add(new Option(x,x)))}
function save(){S.title=$('courseTitle').value.trim()||S.title;const a=saved();a[S.title]={savedAt:new Date().toISOString(),data:project()};localStorage.setItem('runlineStudioCourses',JSON.stringify(a));refresh();toast('Editable course saved')}$('saveBtn').onclick=save;$('loadBtn').onclick=()=>{const n=$('savedCourses').value,a=saved();if(n&&a[n]){S.undo=[];S.redo=[];restore(a[n].data);hist();toast('Course loaded')}};$('newCourseBtn').onclick=()=>{S.undo=[];S.redo=[];restore({field:{w:20,h:40,unit:'m',showGrid:true,showAxes:false,snap:false,grid:2},items:[],annotations:[],title:'Untitled Course',nextNumber:1,background:{src:null,opacity:.35}});hist();toast('Blank course ready')};
function dl(text,name,type='application/json'){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000)}
$('downloadProjectBtn').onclick=()=>{const n=(S.title||'runline-course').replace(/[^a-z0-9-_]+/gi,'-').replace(/^-|-$/g,'').toLowerCase();dl(JSON.stringify(project(),null,2),(n||'runline-course')+'.runline');toast('Editable course downloaded')};$('openProjectBtn').onclick=()=>$('projectFile').click();$('projectFile').onchange=e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>{try{S.undo=[];S.redo=[];restore(JSON.parse(r.result));hist();toast('Editable course opened')}catch{toast('Could not open course file')}};r.readAsText(f);e.target.value=''};

document.querySelectorAll('#exportFormatControl .seg').forEach(b=>b.onclick=()=>{S.exportFormat=b.dataset.format;document.querySelectorAll('#exportFormatControl .seg').forEach(x=>x.classList.toggle('active',x===b))});$('exportGridToggle').onchange=e=>S.exportGrid=e.target.checked;$('exportTitleToggle').onchange=e=>S.exportTitle=e.target.checked;
function exportImg(){const f=fm(),max=2400,titleH=S.exportTitle?130:0,margin=S.field.showAxes?60:0,scale=Math.min(120,(max-margin*2)/Math.max(f.w,f.h)),o=document.createElement('canvas');o.width=Math.round(f.w*scale+margin*2);o.height=Math.round(f.h*scale+titleH+margin*2);const c=o.getContext('2d');c.fillStyle=C.field;c.fillRect(0,0,o.width,o.height);if(titleH){c.fillStyle=C.bg;c.fillRect(0,0,o.width,titleH);c.fillStyle='#F4F6F5';c.font='800 34px Arial,sans-serif';c.fillText(S.title.toUpperCase(),38,52);c.fillStyle=C.teal;c.font='700 16px Arial,sans-serif';c.fillText('RUNLINE STUDIO  •  '+S.field.w+' × '+S.field.h+' '+S.field.unit,38,88)}const old={...V};V={left:margin,top:titleH+margin,width:f.w*scale,height:f.h*scale,scale};if(S.backgroundImage){c.save();c.globalAlpha=S.background.opacity;c.drawImage(S.backgroundImage,V.left,V.top,V.width,V.height);c.restore()}grid(c,S.exportGrid,S.field.showAxes);S.annotations.forEach(a=>ann(c,a,false));S.items.forEach(i=>item(c,i,false));c.strokeStyle='#9DA5A1';c.lineWidth=2;c.strokeRect(V.left+1,V.top+1,V.width-2,V.height-2);V=old;const mime=S.exportFormat==='jpg'?'image/jpeg':'image/png',ext=S.exportFormat==='jpg'?'jpg':'png',u=o.toDataURL(mime,.94),a=document.createElement('a'),n=(S.title||'runline-course').replace(/[^a-z0-9-_]+/gi,'-').replace(/^-|-$/g,'').toLowerCase();a.href=u;a.download=(n||'runline-course')+'.'+ext;document.body.appendChild(a);a.click();a.remove();toast('Image exported');draw()}$('exportBtn').onclick=exportImg;

function panel(s){if(s==='left'){workspace.classList.toggle('left-open');if(innerWidth<640)workspace.classList.remove('right-open')}else{workspace.classList.toggle('right-open');if(innerWidth<640)workspace.classList.remove('left-open')}setTimeout(resize,190)}$('mobileMoreBtn').onclick=()=>panel('left');$('mobileEditBtn').onclick=()=>panel('right');document.querySelectorAll('[data-close-panel]').forEach(b=>b.onclick=()=>{workspace.classList.remove(b.dataset.closePanel+'-open');setTimeout(resize,190)});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('installBtn').style.display='inline-block'});$('installBtn').onclick=async()=>{if(installPrompt){installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$('installBtn').style.display='none'}else toast('On iPad: Share → Add to Home Screen')};if(!(matchMedia('(display-mode: standalone)').matches||navigator.standalone)&&/iPad|iPhone|Macintosh/.test(navigator.userAgent))$('installBtn').style.display='inline-block';
function toast(x){const t=$('toast');t.textContent=x;t.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>t.classList.remove('show'),1700)}
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo()}if((e.key==='Delete'||e.key==='Backspace')&&!document.activeElement?.matches('input,select'))$('deleteBtn').click();if(e.key==='Escape'){if(document.body.classList.contains('focus'))focus(false);else{S.selected=null;S.selectedKind=null;S.selectedNumberId=null;tool('select');selUI();draw()}}});addEventListener('resize',()=>setTimeout(resize,60));
sync();refresh();hist();resize();selUI();tool('select');
})();