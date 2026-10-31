(() => {
  'use strict';

  const COLORS = {
    bg:'#0B0D0E', field:'#F2F0E9', grid:'#7C8888', text:'#1C2425', teal:'#21C7B7', teal2:'#3ED8C8',
    contact:'#4B83A6', tunnel:'#D59345', red:'#D94B4B', neutral:'#3E484B', select:'#21C7B7'
  };

  const canvas = document.getElementById('courseCanvas');
  const ctx = canvas.getContext('2d');
  const wrap = document.getElementById('canvasWrap');
  const emptyHint = document.getElementById('emptyHint');
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  const el = id => document.getElementById(id);
  const state = {
    field:{w:20,h:40,unit:'m',showGrid:true,snap:false,grid:2},
    items:[],
    lines:[],
    selected:null,
    selectedKind:null,
    tool:'select',
    zoom:1,
    pan:{x:0,y:0},
    exportFormat:'png',
    exportGrid:false,
    exportTitle:true,
    autoNumber:false,
    nextNumber:1,
    drag:null,
    drawingLine:null,
    pointerMap:new Map(),
    pinch:null,
    undo:[],redo:[],
    restoring:false,
    title:'Untitled Course'
  };

  const names = {
    jump:'Jump', redjump:'Snooker red', double:'Double jump', triple:'Triple jump', wall:'Wall', tire:'Tire',
    longjump:'Long jump', weaves:'Weave poles', dogwalk:'Dog walk', aframe:'A-frame', teeter:'Teeter',
    tunnel:'Tunnel', table:'Table'
  };

  const defaults = {
    jump:{w:3.0,h:.28}, redjump:{w:3.0,h:.28}, double:{w:3.0,h:.65}, triple:{w:3.0,h:1.0}, wall:{w:3.0,h:.42},
    tire:{w:2.0,h:.45}, longjump:{w:1.2,h:3.5}, weaves:{w:.45,h:7.2}, dogwalk:{w:1.0,h:11.0},
    aframe:{w:2.2,h:5.6}, teeter:{w:1.0,h:4.0}, tunnel:{w:5.0,h:1.0,curve:.35}, table:{w:1.2,h:1.2}
  };

  let view = {left:0,top:0,width:0,height:0,scale:1};

  function snapshot(){
    return JSON.stringify({field:state.field,items:state.items,lines:state.lines,title:state.title,nextNumber:state.nextNumber});
  }
  function pushHistory(){
    if(state.restoring) return;
    const s=snapshot();
    if(state.undo[state.undo.length-1]!==s){state.undo.push(s); if(state.undo.length>80) state.undo.shift();}
    state.redo=[]; updateUndoButtons();
  }
  function restore(s){
    state.restoring=true;
    const o=JSON.parse(s);
    state.field={...o.field};state.items=o.items||[];state.lines=o.lines||[];state.title=o.title||'Untitled Course';state.nextNumber=o.nextNumber||1;
    state.selected=null;state.selectedKind=null;
    syncControls();fitCanvas();draw();updateSelectionUI();
    state.restoring=false;
  }
  function undo(){
    if(state.undo.length<2) return;
    const cur=state.undo.pop(); state.redo.push(cur); restore(state.undo[state.undo.length-1]); updateUndoButtons();
  }
  function redo(){
    if(!state.redo.length) return;
    const next=state.redo.pop();state.undo.push(next);restore(next);updateUndoButtons();
  }
  function updateUndoButtons(){el('undoBtn').disabled=state.undo.length<2;el('redoBtn').disabled=!state.redo.length;}

  function unitToMeters(v){return state.field.unit==='m'?v:v*0.3048;}
  function metersToUnit(v){return state.field.unit==='m'?v:v/0.3048;}
  function fieldMeters(){return {w:unitToMeters(state.field.w),h:unitToMeters(state.field.h)};}

  function syncControls(){
    el('fieldWidth').value=state.field.w;el('fieldHeight').value=state.field.h;el('gridToggle').checked=state.field.showGrid;el('snapToggle').checked=state.field.snap;el('gridSpacing').value=state.field.grid;
    document.querySelectorAll('#unitControl .seg').forEach(b=>b.classList.toggle('active',b.dataset.unit===state.field.unit));
    el('courseTitle').value=state.title; el('autoNumberToggle').checked=state.autoNumber;
  }

  function computeView(){
    const rect=wrap.getBoundingClientRect();
    const pad=20;
    const fm=fieldMeters();
    const aspect=fm.w/fm.h;
    let w=Math.max(160,rect.width-pad*2), h=Math.max(160,rect.height-pad*2);
    let cw,ch;
    if(w/h>aspect){ch=h;cw=ch*aspect;} else {cw=w;ch=cw/aspect;}
    cw*=state.zoom;ch*=state.zoom;
    view={left:(rect.width-cw)/2+state.pan.x,top:(rect.height-ch)/2+state.pan.y,width:cw,height:ch,scale:cw/fm.w};
  }

  function fitCanvas(){state.zoom=1;state.pan={x:0,y:0}; resizeCanvas();}
  function resizeCanvas(){
    const rect=wrap.getBoundingClientRect();
    canvas.style.width=rect.width+'px';canvas.style.height=rect.height+'px';
    canvas.width=Math.max(1,Math.round(rect.width*dpr));canvas.height=Math.max(1,Math.round(rect.height*dpr));
    ctx.setTransform(dpr,0,0,dpr,0,0);computeView();draw();
  }

  function worldToScreen(x,y){return {x:view.left+x*view.scale,y:view.top+y*view.scale};}
  function screenToWorld(x,y){return {x:(x-view.left)/view.scale,y:(y-view.top)/view.scale};}
  function snapPoint(p){
    if(!state.field.snap) return p;
    const g=unitToMeters(Number(state.field.grid)||1);
    return {x:Math.round(p.x/g)*g,y:Math.round(p.y/g)*g};
  }
  function clampPoint(p){const f=fieldMeters();return {x:Math.max(0,Math.min(f.w,p.x)),y:Math.max(0,Math.min(f.h,p.y))};}

  function draw(){
    const rect=wrap.getBoundingClientRect();
    ctx.clearRect(0,0,rect.width,rect.height);computeView();
    ctx.save();ctx.fillStyle=COLORS.field;ctx.fillRect(view.left,view.top,view.width,view.height);
    drawGrid(ctx,view,state.field.showGrid);
    ctx.save();ctx.beginPath();ctx.rect(view.left,view.top,view.width,view.height);ctx.clip();
    for(const l of state.lines) drawLine(ctx,l,l.id===state.selected&&state.selectedKind==='line');
    for(const item of state.items) drawItem(ctx,item,item.id===state.selected&&state.selectedKind==='item');
    if(state.drawingLine) drawLine(ctx,state.drawingLine,false,true);
    ctx.restore();
    ctx.strokeStyle='#c7cbc5';ctx.lineWidth=1;ctx.strokeRect(view.left+.5,view.top+.5,view.width-1,view.height-1);ctx.restore();
    emptyHint.style.display=(state.items.length||state.lines.length)?'none':'flex';
  }

  function drawGrid(c,v,show){
    if(!show) return;
    const fm=fieldMeters();
    const grid=unitToMeters(Number(state.field.grid)||1);
    c.save();c.strokeStyle=COLORS.grid;c.globalAlpha=.18;c.lineWidth=1;
    c.beginPath();
    for(let x=grid;x<fm.w-.0001;x+=grid){const s=worldToScreen(x,0);c.moveTo(s.x,v.top);c.lineTo(s.x,v.top+v.height);}
    for(let y=grid;y<fm.h-.0001;y+=grid){const s=worldToScreen(0,y);c.moveTo(v.left,s.y);c.lineTo(v.left+v.width,s.y);}
    c.stroke();c.restore();
  }

  function drawItem(c,item,selected=false){
    const p=worldToScreen(item.x,item.y);const sc=view.scale;const w=item.w*sc,h=item.h*sc;const a=(item.rot||0)*Math.PI/180;
    c.save();c.translate(p.x,p.y);c.rotate(a);c.lineCap='round';c.lineJoin='round';
    if(selected){c.save();c.strokeStyle=COLORS.select;c.globalAlpha=.75;c.setLineDash([5,4]);c.lineWidth=2;c.strokeRect(-w/2-6,-h/2-6,w+12,h+12);c.restore();}
    switch(item.type){
      case 'jump': case 'redjump': drawJump(c,w,h,item.type==='redjump'?COLORS.red:COLORS.teal);break;
      case 'double': drawMultiJump(c,w,h,COLORS.teal,2);break;
      case 'triple': drawMultiJump(c,w,h,COLORS.teal,3);break;
      case 'wall': drawWall(c,w,h);break;
      case 'tire': drawTire(c,w,h);break;
      case 'longjump': drawLongJump(c,w,h);break;
      case 'weaves': drawWeaves(c,w,h);break;
      case 'dogwalk': drawDogwalk(c,w,h);break;
      case 'aframe': drawAframe(c,w,h);break;
      case 'teeter': drawTeeter(c,w,h);break;
      case 'tunnel': drawTunnel(c,w,item.curve??.35);break;
      case 'table': drawTable(c,w,h);break;
    }
    c.restore();
    if(item.num){
      const np=numberPosition(item); const sp=worldToScreen(np.x,np.y); const label=String(item.num)+(item.suffix||'');
      c.save();c.font='700 12px Inter, sans-serif';const tw=c.measureText(label).width;c.fillStyle=COLORS.field;c.strokeStyle='#4b5656';c.lineWidth=1;c.beginPath();c.roundRect(sp.x-tw/2-5,sp.y-10,tw+10,20,7);c.fill();c.stroke();c.fillStyle='#152020';c.textAlign='center';c.textBaseline='middle';c.fillText(label,sp.x,sp.y+.5);c.restore();
    }
  }

  function numberPosition(item){
    const d=Math.max(item.w,item.h)/2+0.75;const a=((item.rot||0)-90)*Math.PI/180;
    return {x:item.x+Math.cos(a)*d,y:item.y+Math.sin(a)*d};
  }

  function drawJump(c,w,h,color){
    const bar=Math.max(3,h*.55);c.strokeStyle=color;c.lineWidth=3;c.beginPath();c.moveTo(-w/2,0);c.lineTo(w/2,0);c.stroke();
    c.strokeStyle='#596568';c.lineWidth=2;c.beginPath();c.moveTo(-w/2,-bar);c.lineTo(-w/2,bar);c.moveTo(w/2,-bar);c.lineTo(w/2,bar);c.stroke();
  }
  function drawMultiJump(c,w,h,color,count){
    c.strokeStyle=color;c.lineWidth=3;for(let i=0;i<count;i++){const y=(-h/2)+(i/(count-1||1))*h;c.beginPath();c.moveTo(-w/2,y);c.lineTo(w/2,y);c.stroke();}
    c.strokeStyle='#596568';c.lineWidth=2;c.beginPath();c.moveTo(-w/2,-h/2-5);c.lineTo(-w/2,h/2+5);c.moveTo(w/2,-h/2-5);c.lineTo(w/2,h/2+5);c.stroke();
  }
  function drawWall(c,w,h){c.fillStyle='#566165';c.fillRect(-w/2,-Math.max(4,h/2),w,Math.max(8,h));c.strokeStyle=COLORS.teal;c.lineWidth=2;c.strokeRect(-w/2,-Math.max(4,h/2),w,Math.max(8,h));}
  function drawTire(c,w,h){const r=Math.max(7,Math.min(w,h*8)/2);c.strokeStyle=COLORS.teal;c.lineWidth=4;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.stroke();c.strokeStyle='#596568';c.lineWidth=2;c.beginPath();c.moveTo(-w/2,0);c.lineTo(-r-3,0);c.moveTo(r+3,0);c.lineTo(w/2,0);c.stroke();}
  function drawLongJump(c,w,h){c.fillStyle='rgba(33,199,183,.20)';c.strokeStyle=COLORS.teal;c.lineWidth=2;c.fillRect(-w/2,-h/2,w,h);c.strokeRect(-w/2,-h/2,w,h);for(let y=-h/2+h/4;y<h/2;y+=h/4){c.beginPath();c.moveTo(-w/2,y);c.lineTo(w/2,y);c.stroke();}}
  function drawWeaves(c,w,h){c.strokeStyle=COLORS.neutral;c.lineWidth=2;c.beginPath();c.moveTo(0,-h/2);c.lineTo(0,h/2);c.stroke();const n=12;for(let i=0;i<n;i++){const y=-h/2+(i/(n-1))*h;c.fillStyle=i%2?COLORS.teal:'#596568';c.beginPath();c.arc(0,y,3.2,0,Math.PI*2);c.fill();}}
  function drawDogwalk(c,w,h){c.fillStyle='rgba(75,131,166,.25)';c.strokeStyle=COLORS.contact;c.lineWidth=2;c.fillRect(-w/2,-h/2,w,h);c.strokeRect(-w/2,-h/2,w,h);c.fillStyle='rgba(217,75,75,.55)';c.fillRect(-w/2,-h/2,w,h*.18);c.fillRect(-w/2,h/2-h*.18,w,h*.18);}
  function drawAframe(c,w,h){c.fillStyle='rgba(75,131,166,.28)';c.strokeStyle=COLORS.contact;c.lineWidth=2;c.beginPath();c.moveTo(0,-h/2);c.lineTo(w/2,h/2);c.lineTo(-w/2,h/2);c.closePath();c.fill();c.stroke();c.strokeStyle='rgba(217,75,75,.7)';c.beginPath();c.moveTo(-w*.32,h*.2);c.lineTo(w*.32,h*.2);c.stroke();}
  function drawTeeter(c,w,h){c.fillStyle='rgba(75,131,166,.3)';c.strokeStyle=COLORS.contact;c.lineWidth=2;c.fillRect(-w/2,-h/2,w,h);c.strokeRect(-w/2,-h/2,w,h);c.fillStyle=COLORS.contact;c.beginPath();c.arc(0,0,5,0,Math.PI*2);c.fill();}
  function drawTunnel(c,w,curve){const bend=Math.max(-1,Math.min(1,curve))*w*.45;c.strokeStyle=COLORS.tunnel;c.lineWidth=Math.max(10,view.scale*.8);c.beginPath();c.moveTo(-w/2,0);c.quadraticCurveTo(0,bend,w/2,0);c.stroke();c.strokeStyle='rgba(255,255,255,.42)';c.lineWidth=1.5;for(let t=.08;t<1;t+=.12){const pt=quadPoint(-w/2,0,0,bend,w/2,0,t);c.beginPath();c.arc(pt.x,pt.y,Math.max(5,view.scale*.42),0,Math.PI*2);c.stroke();}}
  function drawTable(c,w,h){c.fillStyle='rgba(62,72,75,.24)';c.strokeStyle=COLORS.neutral;c.lineWidth=2;c.fillRect(-w/2,-h/2,w,h);c.strokeRect(-w/2,-h/2,w,h);c.beginPath();c.moveTo(-w/2,-h/2);c.lineTo(w/2,h/2);c.moveTo(w/2,-h/2);c.lineTo(-w/2,h/2);c.stroke();}
  function quadPoint(x0,y0,cx,cy,x1,y1,t){const mt=1-t;return{x:mt*mt*x0+2*mt*t*cx+t*t*x1,y:mt*mt*y0+2*mt*t*cy+t*t*y1};}

  function drawLine(c,line,selected=false,preview=false){
    const a=worldToScreen(line.x1,line.y1),b=worldToScreen(line.x2,line.y2);c.save();c.strokeStyle=COLORS.red;c.lineWidth=preview?3:3;c.setLineDash(line.dashed?[9,6]:[]);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();
    if(selected){c.setLineDash([]);c.fillStyle=COLORS.field;c.strokeStyle=COLORS.select;c.lineWidth=2;for(const p of [a,b]){c.beginPath();c.arc(p.x,p.y,6,0,Math.PI*2);c.fill();c.stroke();}}
    c.restore();
  }

  function addObstacle(type){
    pushHistory();const f=fieldMeters(),d=defaults[type];
    let x=f.w/2,y=f.h/2;
    const item={id:'i'+Date.now()+Math.random().toString(36).slice(2,6),type,x,y,rot:0,w:d.w,h:d.h,curve:d.curve??0,num:null,suffix:''};
    if(state.autoNumber){item.num=state.nextNumber++;}
    state.items.push(item);state.selected=item.id;state.selectedKind='item';state.tool='select';updateToolUI();pushHistory();updateSelectionUI();draw();toast(names[type]+' added');
  }

  function hitTestItem(p){
    for(let i=state.items.length-1;i>=0;i--){
      const it=state.items[i];const dx=p.x-it.x,dy=p.y-it.y;const a=-(it.rot||0)*Math.PI/180;
      const lx=dx*Math.cos(a)-dy*Math.sin(a),ly=dx*Math.sin(a)+dy*Math.cos(a);
      if(it.type==='tunnel'){
        const bend=(it.curve||0)*it.w*.45;let best=Infinity,prev={x:-it.w/2,y:0};
        for(let t=.05;t<=1.001;t+=.05){const cur=quadPoint(-it.w/2,0,0,bend,it.w/2,0,Math.min(1,t));best=Math.min(best,pointToSegDist({x:lx,y:ly},prev,cur));prev=cur;}
        if(best<.72)return it;
      } else {
        const pad=.5;if(Math.abs(lx)<=it.w/2+pad&&Math.abs(ly)<=it.h/2+pad)return it;
      }
    }return null;
  }
  function pointToSegDist(p,a,b){const vx=b.x-a.x,vy=b.y-a.y,wx=p.x-a.x,wy=p.y-a.y;const c1=vx*wx+vy*wy;if(c1<=0)return Math.hypot(p.x-a.x,p.y-a.y);const c2=vx*vx+vy*vy;if(c2<=c1)return Math.hypot(p.x-b.x,p.y-b.y);const t=c1/c2;return Math.hypot(p.x-(a.x+t*vx),p.y-(a.y+t*vy));}
  function hitTestLine(p){for(let i=state.lines.length-1;i>=0;i--){const l=state.lines[i];if(pointToSegDist(p,{x:l.x1,y:l.y1},{x:l.x2,y:l.y2})<.45)return l;}return null;}

  function canvasPoint(e){const r=canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
  function inField(s){return s.x>=view.left&&s.x<=view.left+view.width&&s.y>=view.top&&s.y<=view.top+view.height;}

  canvas.addEventListener('pointerdown',e=>{
    canvas.setPointerCapture?.(e.pointerId);state.pointerMap.set(e.pointerId,canvasPoint(e));
    if(state.pointerMap.size===2){const pts=[...state.pointerMap.values()];state.pinch={dist:Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y),zoom:state.zoom};return;}
    const s=canvasPoint(e);if(!inField(s)) return;let p=clampPoint(screenToWorld(s.x,s.y));
    if(state.tool==='line'){pushHistory();p=snapPoint(p);state.drawingLine={id:'l'+Date.now(),x1:p.x,y1:p.y,x2:p.x,y2:p.y,dashed:false};draw();return;}
    const item=hitTestItem(p);if(item){state.selected=item.id;state.selectedKind='item';state.drag={kind:'item',id:item.id,off:{x:p.x-item.x,y:p.y-item.y},before:snapshot()};updateSelectionUI();draw();return;}
    const line=hitTestLine(p);if(line){state.selected=line.id;state.selectedKind='line';state.drag={kind:'line',id:line.id,off:{x:p.x-(line.x1+line.x2)/2,y:p.y-(line.y1+line.y2)/2},before:snapshot()};updateSelectionUI();draw();return;}
    state.selected=null;state.selectedKind=null;updateSelectionUI();draw();
  });

  canvas.addEventListener('pointermove',e=>{
    if(state.pointerMap.has(e.pointerId)) state.pointerMap.set(e.pointerId,canvasPoint(e));
    if(state.pointerMap.size===2&&state.pinch){const pts=[...state.pointerMap.values()];const d=Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y);state.zoom=Math.max(.55,Math.min(3,state.pinch.zoom*(d/state.pinch.dist)));computeView();draw();return;}
    const s=canvasPoint(e);let p=clampPoint(screenToWorld(s.x,s.y));p=snapPoint(p);
    if(state.drawingLine){state.drawingLine.x2=p.x;state.drawingLine.y2=p.y;draw();return;}
    if(!state.drag)return;
    if(state.drag.kind==='item'){
      const it=state.items.find(x=>x.id===state.drag.id);if(!it)return;it.x=p.x-state.drag.off.x;it.y=p.y-state.drag.off.y;const f=fieldMeters();it.x=Math.max(0,Math.min(f.w,it.x));it.y=Math.max(0,Math.min(f.h,it.y));draw();
    }else{
      const l=state.lines.find(x=>x.id===state.drag.id);if(!l)return;const cx=(l.x1+l.x2)/2,cy=(l.y1+l.y2)/2;const nx=p.x-state.drag.off.x,ny=p.y-state.drag.off.y;const dx=nx-cx,dy=ny-cy;l.x1+=dx;l.x2+=dx;l.y1+=dy;l.y2+=dy;draw();
    }
  });

  function pointerEnd(e){
    state.pointerMap.delete(e.pointerId);if(state.pointerMap.size<2)state.pinch=null;
    if(state.drawingLine){const l=state.drawingLine;state.drawingLine=null;if(Math.hypot(l.x2-l.x1,l.y2-l.y1)>.25){state.lines.push(l);state.selected=l.id;state.selectedKind='line';pushHistory();updateSelectionUI();}draw();}
    else if(state.drag){state.drag=null;pushHistory();}
  }
  canvas.addEventListener('pointerup',pointerEnd);canvas.addEventListener('pointercancel',pointerEnd);
  canvas.addEventListener('wheel',e=>{e.preventDefault();const factor=e.deltaY>0?.92:1.08;state.zoom=Math.max(.55,Math.min(3,state.zoom*factor));computeView();draw();},{passive:false});

  function selectedItem(){return state.selectedKind==='item'?state.items.find(x=>x.id===state.selected):null;}
  function updateSelectionUI(){
    const it=selectedItem();el('noSelection').hidden=!!state.selected;el('selectionControls').hidden=!state.selected;
    if(!state.selected)return;
    el('selectionName').textContent=it?names[it.type]:'Gamble line';
    el('numberControls').hidden=!it;el('rotationSlider').parentElement.hidden=!it;el('tunnelControls').hidden=!(it&&it.type==='tunnel');
    if(it){el('rotationSlider').value=it.rot||0;el('rotationValue').textContent=Math.round(it.rot||0)+'°';el('numberInput').value=it.num??'';el('suffixSelect').value=it.suffix||'';
      if(it.type==='tunnel'){el('tunnelLengthSlider').value=it.w;el('tunnelLengthValue').textContent=Number(it.w).toFixed(2);el('tunnelCurveSlider').value=Math.round((it.curve||0)*100);el('tunnelCurveValue').textContent=Math.round((it.curve||0)*100)+'%';}
    }
  }

  function updateToolUI(){el('lineToolBtn').classList.toggle('active',state.tool==='line');el('selectToolBtn').classList.toggle('active',state.tool==='select');}

  document.querySelectorAll('[data-type]').forEach(b=>{if(!b.closest('#unitControl')&&!b.closest('#exportFormatControl'))b.addEventListener('click',()=>addObstacle(b.dataset.type));});
  el('lineToolBtn').onclick=()=>{state.tool='line';updateToolUI();};el('selectToolBtn').onclick=()=>{state.tool='select';updateToolUI();};
  el('undoBtn').onclick=undo;el('redoBtn').onclick=redo;
  el('focusBtn').onclick=()=>{document.body.classList.toggle('focus');setTimeout(resizeCanvas,60);};
  el('fitBtn').onclick=fitCanvas;el('zoomInBtn').onclick=()=>{state.zoom=Math.min(3,state.zoom*1.15);resizeCanvas();};el('zoomOutBtn').onclick=()=>{state.zoom=Math.max(.55,state.zoom/1.15);resizeCanvas();};

  function fieldChanged(){pushHistory();state.field.w=Math.max(5,Number(el('fieldWidth').value)||20);state.field.h=Math.max(5,Number(el('fieldHeight').value)||40);pushHistory();fitCanvas();}
  el('fieldWidth').addEventListener('change',fieldChanged);el('fieldHeight').addEventListener('change',fieldChanged);
  document.querySelectorAll('#unitControl .seg').forEach(b=>b.onclick=()=>{
    if(b.dataset.unit===state.field.unit)return;pushHistory();const old=state.field.unit;const wM=old==='m'?state.field.w:state.field.w*.3048;const hM=old==='m'?state.field.h:state.field.h*.3048;state.field.unit=b.dataset.unit;state.field.w=+(state.field.unit==='m'?wM:wM/0.3048).toFixed(1);state.field.h=+(state.field.unit==='m'?hM:hM/0.3048).toFixed(1);syncControls();pushHistory();fitCanvas();
  });
  el('gridToggle').onchange=e=>{pushHistory();state.field.showGrid=e.target.checked;pushHistory();draw();};
  el('snapToggle').onchange=e=>{state.field.snap=e.target.checked;};el('gridSpacing').onchange=e=>{state.field.grid=Number(e.target.value);draw();};
  el('courseTitle').addEventListener('change',e=>{pushHistory();state.title=e.target.value.trim()||'Untitled Course';pushHistory();});

  el('rotationSlider').addEventListener('input',e=>{const it=selectedItem();if(!it)return;it.rot=Number(e.target.value);el('rotationValue').textContent=it.rot+'°';draw();});
  el('rotationSlider').addEventListener('change',pushHistory);
  el('tunnelLengthSlider').addEventListener('input',e=>{const it=selectedItem();if(!it)return;it.w=Number(e.target.value);el('tunnelLengthValue').textContent=it.w.toFixed(2);draw();});
  el('tunnelLengthSlider').addEventListener('change',pushHistory);
  el('tunnelCurveSlider').addEventListener('input',e=>{const it=selectedItem();if(!it)return;it.curve=Number(e.target.value)/100;el('tunnelCurveValue').textContent=e.target.value+'%';draw();});
  el('tunnelCurveSlider').addEventListener('change',pushHistory);
  el('numberInput').addEventListener('change',e=>{const it=selectedItem();if(!it)return;pushHistory();it.num=e.target.value?Number(e.target.value):null;if(it.num)state.nextNumber=Math.max(state.nextNumber,it.num+1);pushHistory();draw();});
  el('suffixSelect').onchange=e=>{const it=selectedItem();if(!it)return;pushHistory();it.suffix=e.target.value;pushHistory();draw();};
  el('autoNumberToggle').onchange=e=>state.autoNumber=e.target.checked;
  el('duplicateBtn').onclick=()=>{if(!state.selected)return;pushHistory();if(state.selectedKind==='item'){const it=selectedItem();const copy={...it,id:'i'+Date.now(),x:it.x+.6,y:it.y+.6,num:null,suffix:''};if(state.autoNumber)copy.num=state.nextNumber++;state.items.push(copy);state.selected=copy.id;}else{const l=state.lines.find(x=>x.id===state.selected);const copy={...l,id:'l'+Date.now(),x1:l.x1+.5,x2:l.x2+.5,y1:l.y1+.5,y2:l.y2+.5};state.lines.push(copy);state.selected=copy.id;}pushHistory();updateSelectionUI();draw();};
  el('deleteBtn').onclick=()=>{if(!state.selected)return;pushHistory();if(state.selectedKind==='item')state.items=state.items.filter(x=>x.id!==state.selected);else state.lines=state.lines.filter(x=>x.id!==state.selected);state.selected=null;state.selectedKind=null;pushHistory();updateSelectionUI();draw();};

  function saveCourses(){
    const all=JSON.parse(localStorage.getItem('runlineStudioCourses')||'{}');all[state.title]={savedAt:new Date().toISOString(),data:snapshot()};localStorage.setItem('runlineStudioCourses',JSON.stringify(all));refreshSavedCourses();toast('Course saved locally');
  }
  function refreshSavedCourses(){const sel=el('savedCourses');const all=JSON.parse(localStorage.getItem('runlineStudioCourses')||'{}');sel.innerHTML='';const names=Object.keys(all).sort((a,b)=>(all[b].savedAt||'').localeCompare(all[a].savedAt||''));if(!names.length){const o=document.createElement('option');o.textContent='No saved courses';o.value='';sel.appendChild(o);}else names.forEach(n=>{const o=document.createElement('option');o.value=n;o.textContent=n;sel.appendChild(o);});}
  el('saveBtn').onclick=saveCourses;el('loadBtn').onclick=()=>{const n=el('savedCourses').value;if(!n)return;const all=JSON.parse(localStorage.getItem('runlineStudioCourses')||'{}');if(all[n]){state.undo=[];state.redo=[];restore(all[n].data);pushHistory();toast('Course loaded');}};
  el('newCourseBtn').onclick=()=>{state.field={w:20,h:40,unit:'m',showGrid:true,snap:false,grid:2};state.items=[];state.lines=[];state.title='Untitled Course';state.nextNumber=1;state.selected=null;state.selectedKind=null;state.undo=[];state.redo=[];syncControls();fitCanvas();pushHistory();updateSelectionUI();toast('Blank course ready');};

  document.querySelectorAll('#exportFormatControl .seg').forEach(b=>b.onclick=()=>{state.exportFormat=b.dataset.format;document.querySelectorAll('#exportFormatControl .seg').forEach(x=>x.classList.toggle('active',x===b));});
  el('exportGridToggle').onchange=e=>state.exportGrid=e.target.checked;el('exportTitleToggle').onchange=e=>state.exportTitle=e.target.checked;

  function exportImage(){
    const fm=fieldMeters();const max=2200;const titleH=state.exportTitle?130:0;const scale=Math.min(120,max/Math.max(fm.w,fm.h));const out=document.createElement('canvas');out.width=Math.round(fm.w*scale);out.height=Math.round(fm.h*scale+titleH);const c=out.getContext('2d');
    c.fillStyle=COLORS.field;c.fillRect(0,0,out.width,out.height);
    if(titleH){c.fillStyle=COLORS.bg;c.fillRect(0,0,out.width,titleH);c.fillStyle='#F4F6F5';c.font='800 34px "Arial Narrow", sans-serif';c.fillText(state.title.toUpperCase(),38,52);c.fillStyle=COLORS.teal;c.font='700 16px Arial, sans-serif';c.fillText(`RUNLINE STUDIO  •  ${state.field.w} × ${state.field.h} ${state.field.unit}`,38,88);}
    const old={...view};view={left:0,top:titleH,width:fm.w*scale,height:fm.h*scale,scale};
    drawGrid(c,view,state.exportGrid);
    for(const l of state.lines) drawLine(c,l,false);
    for(const item of state.items) drawItem(c,item,false);
    c.strokeStyle='#9DA5A1';c.lineWidth=2;c.strokeRect(1,titleH+1,out.width-2,out.height-titleH-2);view=old;
    const type=state.exportFormat==='jpg'?'image/jpeg':'image/png';const ext=state.exportFormat==='jpg'?'jpg':'png';const url=out.toDataURL(type,.94);const a=document.createElement('a');const safe=(state.title||'runline-course').replace(/[^a-z0-9-_]+/gi,'-').replace(/^-|-$/g,'').toLowerCase();a.href=url;a.download=`${safe||'runline-course'}.${ext}`;document.body.appendChild(a);a.click();a.remove();toast('Image exported');draw();
  }
  el('exportBtn').onclick=exportImage;

  function toast(msg){const t=el('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),1500);}

  el('mobileMoreBtn').onclick=()=>{document.querySelector('.right-panel').classList.remove('open');document.querySelector('.left-panel').classList.toggle('open');};
  el('mobileEditBtn').onclick=()=>{document.querySelector('.left-panel').classList.remove('open');document.querySelector('.right-panel').classList.toggle('open');};
  document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo();}if(e.key==='Delete'||e.key==='Backspace'){if(document.activeElement?.matches('input,select'))return;el('deleteBtn').click();}if(e.key==='Escape'){state.tool='select';state.selected=null;state.selectedKind=null;updateToolUI();updateSelectionUI();draw();}});

  window.addEventListener('resize',()=>setTimeout(resizeCanvas,50));
  syncControls();refreshSavedCourses();pushHistory();resizeCanvas();updateSelectionUI();updateToolUI();
})();
