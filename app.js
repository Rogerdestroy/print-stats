(function(){
'use strict';

/* ================= 設定(要改班級或起算日,改這裡) ================= */
const CONFIG={
  startDate:'2026-08-01',                 // 統計起算日(網頁「資料」視窗內也能改)
  grades:[                                // 年級代碼, 名稱, 學部, 班級號碼
    {code:'7',name:'七年級',level:'國中',classes:[701,702,703,704,705]},
    {code:'8',name:'八年級',level:'國中',classes:[801,802,803,804,805]},
    {code:'9',name:'九年級',level:'國中',classes:[901,902,903,904,905]},
    {code:'1',name:'高一',level:'高中',classes:[101,102,103,104,105,106]},
    {code:'2',name:'高二',level:'高中',classes:[201,202,203,204,205,206]},
    {code:'3',name:'高三',level:'高中',classes:[301,302,303,304,305,306]},
  ],
  subjects:{CN:'國文',EN:'英文',MATH:'數學',SB:'校本',PHY:'物理',CHEM:'化學',BIO:'生物',ES:'地科',HIS:'歷史',GEO:'地理',CIV:'公民',READING:'閱讀',
    COM:'資訊',MUSIC:'音樂',HOME:'家政',PE:'體育',TECH:'生科',HEALTH:'健護',ART:'美術表藝',CLASS:'導師',LIFE:'生涯生命',GUI:'輔導',SC:'童軍',LS:'理化',
    VA:'視藝',ASK:'課諮',INQ:'探究'},
  // 收費辦法:學期初每人預收(國七、國八 50 元;國九及高中 150 元),老師個人每學期額度 100 元
  prepaid:{7:50,8:50,9:150,1:150,2:150,3:150},
  teacherQuota:100,
  // 各班人數(抄自設備組白板,請核對;用來算「每人平均」與預收款)
  sizes:{701:32,702:33,703:32,704:32,705:32,801:33,802:30,803:30,804:29,805:31,901:32,902:31,903:33,904:31,905:32,
    101:30,102:39,103:38,104:39,105:38,106:35,201:32,202:40,203:37,204:37,205:40,206:35,301:26,302:44,303:39,304:37,305:39,306:34},
};
const GRADES=CONFIG.grades;
const CLASS_SET=new Set(GRADES.flatMap(g=>g.classes));
const ALL_CLASSES=GRADES.flatMap(g=>g.classes);
const CLASS_LEVEL={};GRADES.forEach(g=>g.classes.forEach(c=>CLASS_LEVEL[c]=g));

/* ================= 工具 ================= */
const $=(s,el=document)=>el.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf0=new Intl.NumberFormat('zh-TW',{maximumFractionDigits:0});
const nf3=new Intl.NumberFormat('zh-TW',{maximumFractionDigits:3});
const rd=v=>Math.round(v*1000)/1000;
const fM=v=>nf3.format(rd(v));
const fI=v=>nf0.format(v);
const ymLabel=ym=>ym.replace('-','/');
const pad=n=>String(n).padStart(2,'0');
function ymAdd(ym,n){let y=+ym.slice(0,4),m=+ym.slice(5)-1+n;y+=Math.floor(m/12);m=((m%12)+12)%12;return y+'-'+pad(m+1);}
function ymRange(a,b){const o=[];for(let c=a;c<=b;c=ymAdd(c,1))o.push(c);return o;}
const A4='A4 210x297mm',B4='B4 257x364mm',A3='A3 297x420mm';

/* ================= 儲存(瀏覽器內,關掉網頁資料仍在) ================= */
const PK='printstat.v2';
function loadPrefs(){try{return JSON.parse(localStorage.getItem(PK))||{}}catch(e){return{}}}
const P=loadPrefs();
function savePrefs(){try{localStorage.setItem(PK,JSON.stringify({theme:S.theme,metric:S.metric,merge:S.merge,showJob:S.showJob,startDate:S.startDate,preset:S.preset==='custom'?'':S.preset}))}catch(e){}}
let _db=null;
function openDB(){
  if(_db)return _db;
  _db=new Promise((res,rej)=>{
    try{const q=indexedDB.open('printstat-v2',1);q.onupgradeneeded=()=>q.result.createObjectStore('kv');q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);}
    catch(e){rej(e);}
  }).catch(()=>null);
  return _db;
}
const kv={
  async get(k){const db=await openDB();if(!db)return undefined;return new Promise(r=>{const q=db.transaction('kv').objectStore('kv').get(k);q.onsuccess=()=>r(q.result);q.onerror=()=>r(undefined);});},
  async set(k,v){const db=await openDB();if(!db)return;return new Promise(r=>{try{const t=db.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=()=>r();t.onerror=t.onabort=()=>{notifyOnce('瀏覽器儲存空間寫入失敗(可能已滿),資料只會保留到關閉網頁');r();};}catch(e){notifyOnce('無法寫入瀏覽器儲存空間:'+(e.message||e));r();}});},
  async del(k){const db=await openDB();if(!db)return;return new Promise(r=>{try{const t=db.transaction('kv','readwrite');t.objectStore('kv').delete(k);t.oncomplete=()=>r();t.onerror=t.onabort=()=>r();}catch(e){r();}});},
  async entries(){const db=await openDB();if(!db)return[];return new Promise(r=>{const out=[];const q=db.transaction('kv').objectStore('kv').openCursor();q.onsuccess=()=>{const c=q.result;if(c){out.push([c.key,c.value]);c.continue();}else r(out);};q.onerror=()=>r(out);});},
};

/* ================= 讀檔 ================= */
function parseCSV(text){
  const rows=[];let row=[],cur='',q=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(q){if(ch==='"'){if(text[i+1]==='"'){cur+='"';i++;}else q=false;}else cur+=ch;}
    else if(ch==='"')q=true;
    else if(ch===','){row.push(cur);cur='';}
    else if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cur);cur='';rows.push(row);row=[];}
    else cur+=ch;
  }
  if(cur!==''||row.length){row.push(cur);rows.push(row);}
  return rows;
}
function decodeText(buf){
  let t;
  try{t=new TextDecoder('utf-8',{fatal:true}).decode(buf);}catch(e){try{t=new TextDecoder('big5').decode(buf);}catch(e2){t=new TextDecoder('utf-8').decode(buf);}}
  return t.replace(/^﻿/,'');
}
const num=v=>{if(typeof v==='number')return isFinite(v)?v:0;if(v==null||v==='')return 0;const n=parseFloat(String(v).replace(/,/g,''));return isFinite(n)?n:0;};
const str=v=>v==null?'':String(v).trim();
function toStamp(v){
  if(v==null||v==='')return'';
  if(v instanceof Date){return v.getFullYear()+'-'+pad(v.getMonth()+1)+'-'+pad(v.getDate())+' '+pad(v.getHours())+':'+pad(v.getMinutes())+':'+pad(v.getSeconds());}
  if(typeof v==='number'){
    if(v<20000||v>80000)return'';
    const d=new Date(Date.UTC(1899,11,30)+Math.round(v*86400)*1000);
    return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())+' '+pad(d.getUTCHours())+':'+pad(d.getUTCMinutes())+':'+pad(d.getUTCSeconds());
  }
  const m=String(v).match(/(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  return m?m[1]+'-'+pad(+m[2])+'-'+pad(+m[3])+' '+pad(+(m[4]||0))+':'+(m[5]||'00')+':'+pad(+(m[6]||0)):'';
}
// 依欄位名稱找欄位(影印機匯出的欄位名稱含中英文,以關鍵字比對)
const COLKEYS={owner:'Owner name',mode:'工作模式',id:'Job ID',name:'Job name',end:'End printing',endjob:'End job',startp:'Start printing',startj:'Start job',
  status:'Job status1',size:'Output paper size',dup:'Duplex printing',stapler:'Stapler',vol:'Output volume',count:'Print count',pages:'Print pages',
  fp:'列印費用',fs:'裝訂費用',fq:'紙張費用',ft:'總費用'};
function findHeader(aoa){
  for(let i=0;i<Math.min(aoa.length,20);i++){
    const r=aoa[i]||[];
    if(r.some(c=>String(c).includes('Owner name')))return i;
  }
  return-1;
}
function mapCols(hdr){
  const col={};
  for(const[k,key]of Object.entries(COLKEYS)){const i=hdr.findIndex(h=>String(h==null?'':h).includes(key));if(i>=0)col[k]=i;}
  return col;
}
const REQUIRED=['owner','count','pages','vol','size'];
// 由一張工作表(二維陣列)取出每筆工作;startRow = 該表第一列在 Excel 內的列號
function parseJobRows(aoa,startRow){
  const hi=findHeader(aoa);if(hi<0)return null;
  const col=mapCols(aoa[hi]);
  if(!REQUIRED.every(k=>k in col))return null;
  const g=(r,k)=>k in col?r[col[k]]:undefined;
  const rows=[];
  for(let i=hi+1;i<aoa.length;i++){
    const r=aoa[i];if(!r)continue;
    const u=str(g(r,'owner'));if(!u)continue;
    const t=toStamp(g(r,'end'))||toStamp(g(r,'endjob'))||toStamp(g(r,'startp'))||toStamp(g(r,'startj'));
    let e=-1;
    if('ft'in col){
      const tf=g(r,'ft');
      e=(tf===null||tf===undefined||tf==='')?null:[num(g(r,'fp')),num(g(r,'fs')),num(g(r,'fq')),num(tf)];
    }
    rows.push([startRow+i+1,t,str(g(r,'mode')),str(g(r,'id')),str(g(r,'name')),u,str(g(r,'status')),str(g(r,'size')),str(g(r,'dup')),str(g(r,'stapler')),
      num(g(r,'vol')),num(g(r,'count')),num(g(r,'pages')),e]);
  }
  // 費用欄存在但完全沒有數值(檔案不是用 Excel 存的、沒有算出結果)→ 視為沒有 Excel 費用可比對
  const anyFee=rows.some(r=>Array.isArray(r[13]));
  if('ft'in col&&!anyFee)for(const r of rows)r[13]=-1;
  return{rows,hasFee:anyFee,hasId:'id'in col};
}
function parseWorkbook(buf,file){
  if(typeof XLSX==='undefined')throw new Error('Excel 讀取元件未載入(請確認 vendor/xlsx.full.min.js 與網頁放在一起)');
  const wb=XLSX.read(buf,{type:'array',cellDates:false,sheetRows:200000});
  const cands=[];
  for(const name of wb.SheetNames){
    const ws=wb.Sheets[name];if(!ws||!ws['!ref'])continue;
    const rg=XLSX.utils.decode_range(ws['!ref']);
    for(const a in ws)if(a[0]!=='!'&&ws[a].t==='e'){ws[a].t='z';delete ws[a].v;}   // #VALUE! 等錯誤儲存格視為空白,不可當成數字
    const aoa=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null});
    const p=parseJobRows(aoa,rg.s.r);
    if(p&&p.rows.length)cands.push({name,...p});
  }
  if(!cands.length)return null;
  // 主資料:優先有 Job ID 的原始匯出表(工作表1),其次列數最多者
  cands.sort((a,b)=>(b.hasId-a.hasId)||(b.rows.length-a.rows.length));
  const main=cands[0];
  let hasX=main.hasFee;
  if(!hasX){                                    // 用另一張有費用欄的表(工作表2)做「Excel 對照」
    const cmp=cands.find(c=>c!==main&&c.hasFee);
    if(cmp){
      const q=new Map();
      const key=r=>r[5]+'|'+r[1]+'|'+r[4]+'|'+r[11];
      for(const r of cmp.rows){const k=key(r);(q.get(k)||q.set(k,[]).get(k)).push(r[13]);}
      for(const r of main.rows){const a=q.get(key(r));if(a&&a.length)r[13]=a.shift();}
      hasX=true;
    }
  }
  return finishRec(file.name,file,main.name,main.rows,hasX);
}
function finishRec(name,file,sheet,rows,hasX){
  const ts=rows.map(r=>r[1]).filter(Boolean).sort();
  const cnt={};for(const t of ts){const m=t.slice(0,7);cnt[m]=(cnt[m]||0)+1;}
  const modal=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0]||'';
  return{name,size:file.size,mtime:file.lastModified,sheet,hasX,rows,dmin:ts[0]?ts[0].slice(0,10):'',dmax:ts.length?ts[ts.length-1].slice(0,10):'',modal,added:Date.now(),kind:'jobs'};
}

/* ================= 資料來源狀態 ================= */
const SRC={files:new Map(),accounts:null,mapping:null,idx:{}};
const FS={handle:null,syncing:false};
const canFS=typeof window.showDirectoryPicker==='function';
async function loadCache(){
  for(const[k,v]of await kv.entries()){
    if(k.startsWith('file:'))SRC.files.set(k.slice(5),v);
    else if(k==='accounts')SRC.accounts=v;
    else if(k==='mapping')SRC.mapping=v;
    else if(k==='idx')SRC.idx=v||{};
    else if(k==='dirHandle')FS.handle=v||null;
  }
}
function notify(msg,kind=''){
  const box=$('#toasts');
  while(box.children.length>=3)box.firstChild.remove();
  const el=document.createElement('div');el.className='toast '+kind;el.textContent=msg;
  el.onclick=()=>el.remove();box.appendChild(el);
  setTimeout(()=>el.remove(),kind==='err'?12000:7000);
}
const _once=new Set();
function notifyOnce(msg){if(_once.has(msg))return;_once.add(msg);notify(msg,'warn');}
function setBusy(on){$('#busy').style.display=on?'flex':'none';}
const okName=n=>!/^(~\$|\.)/.test(n)&&!/^desktop\.ini$/i.test(n)&&/\.(xlsx|xlsm|xls|csv|txt)$/i.test(n);
const cleanPath=p=>String(p||'').replace(/^\/+/,'');
// inputs: File 或 {file,path};path 是「資料夾/年份/檔名」這樣的相對路徑,用來區分不同年份資料夾內的同名檔案
async function ingest(inputs,opts={}){
  const items=[...inputs].map(x=>x.file?x:{file:x,path:cleanPath(x.webkitRelativePath)||x.name}).filter(it=>okName(it.file.name));
  if(!items.length){if(!opts.quiet)notify('沒有可用的檔案(支援 .xlsx 影印量檔、.csv 帳號列表)','warn');return 0;}
  if(!opts.quiet){setBusy(true);await new Promise(r=>setTimeout(r,30));}
  try{
  const from=opts.from||'manual',added=[],errs=[],info=[];
  for(const it of items){
    const f=it.file,path=it.path;
    try{
      const ext=f.name.split('.').pop().toLowerCase();
      const buf=await f.arrayBuffer();
      let key=null;
      if(ext==='csv'||ext==='txt'){
        const aoa=parseCSV(decodeText(buf));
        const hi=aoa.findIndex(r=>r.includes('User name'));
        const mh=aoa.findIndex(r=>r.includes('帳號')&&r.includes('班級'));
        if(hi>=0){
          const names=aoa.slice(hi+1).map(r=>str(r[aoa[hi].indexOf('User name')])).filter(Boolean);
          SRC.accounts={name:path,names:[...new Set(names)],added:Date.now(),kind:'accounts',from};
          key='accounts';await kv.set(key,SRC.accounts);info.push(`帳號列表 ${SRC.accounts.names.length} 個帳號`);
        }else if(mh>=0){
          const H=aoa[mh],ia=H.indexOf('帳號'),ic=H.indexOf('班級'),is=H.indexOf('科目');
          const rows=[];
          for(const r of aoa.slice(mh+1)){const n=str(r[ia]),c=parseInt(str(r[ic]),10);if(n&&CLASS_SET.has(c))rows.push({name:n,c,s:is>=0?str(r[is]).toUpperCase()||'其他':'其他'});}
          SRC.mapping={name:path,rows,added:Date.now(),kind:'mapping',from};
          key='mapping';await kv.set(key,SRC.mapping);info.push(`帳號對照表 ${rows.length} 筆`);
        }else{
          const p=parseJobRows(aoa,0);
          if(p&&p.rows.length){const rec=finishRec(path,f,'CSV',p.rows,p.hasFee);rec.from=from;key='file:'+path;SRC.files.set(path,rec);await kv.set(key,rec);added.push(path);}
          else errs.push(`無法辨識 ${path}:不是影印機的工作紀錄或帳號列表`);
        }
      }else{
        const rec=parseWorkbook(buf,f);
        if(!rec)errs.push(`${path}:找不到「Owner name(使用者)」等欄位,請確認是影印機匯出的印量檔`);
        else{rec.name=path;rec.from=from;key='file:'+path;SRC.files.set(path,rec);await kv.set(key,rec);added.push(path);}
      }
      if(from==='dir')SRC.idx[path]={sig:f.size+':'+f.lastModified,key:key||''};
    }catch(e){errs.push(`${path} 讀取失敗:${e.message||e}`);}
  }
  await kv.set('idx',SRC.idx);
  rebuildAll();
  const msgs=[];
  if(added.length){
    const rows=added.reduce((a,p)=>a+SRC.files.get(p).rows.length,0);
    const dups=FILES.filter(f=>added.includes(f.name)).reduce((a,f)=>a+f.dup,0);
    msgs.push(['',added.length<=2?`已加入 ${added.map(p=>p+'('+SRC.files.get(p).rows.length+' 筆)').join('、')}`:`已加入 ${added.length} 個檔案,共 ${fI(rows)} 筆`]);
    if(dups)msgs.push(['warn',`其中 ${fI(dups)} 筆與已有資料重複(Job ID 相同),不重複計算`]);
  }
  for(const m of info)msgs.push(['','已載入'+m]);
  for(const e of errs.slice(0,3))msgs.push(['err',e]);
  if(errs.length>3)msgs.push(['err',`…另有 ${errs.length-3} 個檔案失敗`]);
  if(!opts.quiet)setBusy(false);
  for(const[k,m]of msgs)notify(m,k);
  header();render();
  return added.length+info.length;
  }finally{if(!opts.quiet)setBusy(false);}   // 不論中途哪裡出錯,「處理中」遮罩一定會關掉
}

/* ===== 連結「資料」資料夾(Chrome / Edge):之後只要把檔案放進資料夾,就會自動加入 ===== */
async function walk(dir,prefix,out){
  for await(const[name,h]of dir.entries()){
    if(name.startsWith('.')||name.startsWith('~$'))continue;
    if(h.kind==='directory')await walk(h,prefix+name+'/',out);
    else if(okName(name))out.push({path:prefix+name,h});
  }
}
async function ensurePerm(ask){
  if(!FS.handle)return false;
  try{
    const o={mode:'read'};
    let p=await FS.handle.queryPermission(o);
    if(p!=='granted'&&ask)p=await FS.handle.requestPermission(o);
    return p==='granted';
  }catch(e){return false;}
}
async function syncDir(){
  if(!FS.handle||FS.syncing)return-1;
  FS.syncing=true;let n=0;
  try{
    const list=[];await walk(FS.handle,FS.handle.name+'/',list);
    const alive=new Set(list.map(x=>x.path)),todo=[];
    for(const it of list){
      let f;try{f=await it.h.getFile();}catch(e){continue;}
      const old=SRC.idx[it.path];
      if(old&&old.sig===f.size+':'+f.lastModified&&(!old.key.startsWith('file:')||SRC.files.has(it.path)))continue;   // key 為空 = 上次讀取失敗且檔案未變
      todo.push({file:f,path:it.path});
    }
    todo.sort((a,b)=>a.file.lastModified-b.file.lastModified);   // 最新的檔案最後處理(帳號列表以最新為準)
    let removed=0;
    for(const[p,v]of Object.entries(SRC.idx)){
      if(alive.has(p))continue;
      if(!v.key){delete SRC.idx[p];continue;}
      removed++;
      if(v.key==='accounts'){if(SRC.accounts&&SRC.accounts.name===p)SRC.accounts=null;else{delete SRC.idx[p];continue;}}
      else if(v.key==='mapping'){if(SRC.mapping&&SRC.mapping.name===p)SRC.mapping=null;else{delete SRC.idx[p];continue;}}
      else SRC.files.delete(p);
      await kv.del(v.key);delete SRC.idx[p];
    }
    if(todo.length)n+=await ingest(todo,{from:'dir',quiet:true});
    else{await kv.set('idx',SRC.idx);if(removed){rebuildAll();header();render();}}
    if(removed)notify(`資料夾內有 ${removed} 個檔案已被移除,已同步`);
    n+=removed;
  }catch(e){notify('讀取資料夾失敗:'+(e.message||e),'err');}
  finally{FS.syncing=false;updateBanner();syncBtn();}
  return n;
}
async function linkDir(){
  if(!canFS){pickDir();return;}
  try{
    const h=await window.showDirectoryPicker({mode:'read'});
    if(FS.handle&&FS.handle.name!==h.name){
      for(const[p,v]of Object.entries(SRC.idx)){if(v.key.startsWith('file:'))SRC.files.delete(p);if(v.key)await kv.del(v.key);}
      SRC.idx={};
    }
    FS.handle=h;await kv.set('dirHandle',h);
    setBusy(true);await syncDir();setBusy(false);
    notify(`已連結資料夾「${h.name}」。之後把檔案放進去,重新開啟或按「重新讀取」就會加入`);
  }catch(e){setBusy(false);if(e&&e.name!=='AbortError'){notify('這個瀏覽器無法連結資料夾,改為一次性讀取。','warn');pickDir();}}
  updateBanner();syncBtn();if($('#dataDlg').open)openData();
}
async function unlinkDir(){FS.handle=null;SRC.idx={};await kv.del('dirHandle');await kv.set('idx',{});updateBanner();syncBtn();openData();}
async function resync(ask){
  if(!FS.handle)return;
  if(!await ensurePerm(ask)){updateBanner();return;}
  const n=await syncDir();
  if(ask&&n===0)notify('資料夾已是最新,沒有新的檔案');
}
function updateBanner(){
  const el=$('#banner');
  if(!FS.handle){el.innerHTML='';return;}
  ensurePerm(false).then(ok=>{el.innerHTML=ok?'':`<div class="notice">已連結資料夾「${esc(FS.handle.name)}」,瀏覽器需要你再按一次才能讀取。<button class="btn" data-act="reconnect">重新讀取資料夾</button></div>`;});
}
function syncBtn(){const b=$('#syncBtn');if(b)b.style.display=FS.handle?'':'none';}
let lastSync=0;
async function autoSync(){
  if(!FS.handle||FS.syncing||Date.now()-lastSync<4000)return;
  lastSync=Date.now();
  if(await ensurePerm(false))syncDir();
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)autoSync();});
window.addEventListener('focus',autoSync);

/* ================= 帳號(以影印機帳號列表為基準) ================= */
const CLASS_RE=/^([A-Za-z][A-Za-z0-9]*(?:_[A-Za-z][A-Za-z0-9]*)*)[_-](\d{3})$/;
const PREFIX_RE=/^(ELE|EIGHT|ELGHT|EIGJT|ELECT)[_-]/i;
const KIND={class:'班級/科任帳號',staff:'其他已登錄帳號',unknown:'未登錄帳號'};
let REG=new Set(),REG_LIST=[],MAP=new Map(),ACCT=new Map(),PERSON_DISP={};
function classify(name){
  const p=name.replace(PREFIX_RE,'').toLowerCase();
  const m=CLASS_RE.exec(name);
  if(m&&CLASS_SET.has(+m[2]))return{k:'class',c:+m[2],s:m[1].toUpperCase(),p:name};
  return{k:'staff',c:0,s:'',p};
}
function makeAcct(name){
  const mp=MAP.get(name);
  if(mp)return{k:'class',c:mp.c,s:mp.s,p:name,reg:true,map:true};
  if(!REG.size)return{...classify(name),reg:true,nolist:true};
  if(REG.has(name))return{...classify(name),reg:true};
  const nums=(name.match(/\d{3}/g)||[]).map(Number).filter(c=>CLASS_SET.has(c));
  return{k:'unknown',c:0,s:'',p:name.replace(PREFIX_RE,'').toLowerCase(),reg:false,guess:nums[0]||0};
}
const tagOf=n=>/^ELE[_-]/i.test(n)?'選修':/^EIGHT[_-]/i.test(n)?'第八節':n==='TEMP'?'寒暑輔臨時':'';
const acctOf=n=>{let a=ACCT.get(n);if(!a){a=makeAcct(n);ACCT.set(n,a);}return a;};

/* ================= 計費(與 Excel「工作表2」的 N~Q 欄公式逐字對應) ================= */
const rateOf=z=>z===A4?0.25:z===B4?0.3:0.4;
function calc(o){
  const r=rateOf(o.z),L=o.l,M=o.p,H=o.h;
  const pf=r*L;
  const sf=((o.k==='1 position'?0.25:0)+(o.k==='2 positions'?0.5:0))*H;
  let qf=0;
  if(L!==0){const extra=o.d==='Simplex'?0:(M%2===1?H:0);const fac=(M===1||o.d==='Simplex')?1:0.5;qf=r*(L+extra*fac);}
  return[pf,sf,qf,pf+sf+qf];
}
// 張數:雙面正反面算一張。每份張數 = 頁數÷2 進位;失敗/中斷的工作以面數÷2 進位估算
function sheetsOf(o){
  if(o.l<=0)return 0;
  if(o.d==='Simplex')return o.l;
  return(o.p>0&&o.l%o.p===0)?(o.l/o.p)*Math.ceil(o.p/2):Math.ceil(o.l/2);
}
const F={MISS:1,DIFF:2,PART:4,ODD:8,DUP:16,UNREG:32,FIXED:64};
function flagsOf(o){
  let f=0;
  if(o.e===null){if(o.l>0)f|=F.MISS;}else if(Array.isArray(o.e)&&Math.abs(o.e[3]-o.c[3])>0.0005)f|=F.DIFF;
  if(o.s!=='Done'&&o.m!=='Scan'&&o.c[3]>0)f|=F.PART;
  if(o.l>0&&o.z!==A4&&o.z!==B4&&o.z!==A3)f|=F.ODD;
  if(o.g)f|=F.DUP;
  if(!o.a.reg)f|=F.UNREG;
  if(o.u0)f|=F.FIXED;
  return f;
}
const GENERIC_JOB=new Set(['Count Information','全頁相片','Microsoft Word - 文件1']);

/* ================= 資料整理(讀入的檔案 → 統計用資料) ================= */
let R=[],FILES=[],ALL_YM=[],MONTHS=[],YM_MIN='',YM_MAX='',MIN_DAY='',MAX_DAY='',SIZES=[],STATUSES=[],SEMS=[],SYS=[],HAS_X=false,DROP={dup:0,nodate:0};
// 帳號名稱自動更正:全形→半形、去掉前後/多餘空白與隱藏字元(Excel 會把控制字元存成 _x001F_)、
// 大小寫不同但影印機列表內有的帳號,一律改成列表上的寫法
let REG_LC=new Map();
function normName(n){return String(n).normalize('NFKC').replace(/_x[0-9A-Fa-f]{4}_/g,'').replace(/[\u0000-\u001f\u007f​﻿]/g,'').replace(/\s+/g,' ').trim();}
function canonName(n){const t=normName(n);if(REG.has(t))return t;return REG_LC.get(t.toLowerCase())||t;}
function rebuildAccounts(){
  REG=new Set(SRC.accounts?SRC.accounts.names:[]);REG_LIST=[...REG];
  REG_LC=new Map();for(const n of REG_LIST){const k=n.toLowerCase();if(!REG_LC.has(k))REG_LC.set(k,n);}
  MAP=new Map((SRC.mapping?SRC.mapping.rows:[]).map(r=>[canonName(r.name),r]));
  ACCT=new Map();
}
function rebuildAll(){
  rebuildAccounts();
  const files=[...SRC.files.values()].sort((a,b)=>(a.dmin||'').localeCompare(b.dmin||'')||a.name.localeCompare(b.name,'zh-Hant',{numeric:true}));
  FILES=[];R=[];DROP={dup:0,nodate:0};
  const seen=new Set();
  files.forEach((f,fi)=>{
    const st={name:f.name,sheet:f.sheet,hasX:f.hasX,read:f.rows.length,dup:0,kept:0,nodate:0,dmin:f.dmin,dmax:f.dmax,ex:0,calc:0,nMiss:0};
    FILES.push(st);
    for(const r of f.rows){
      const[row,t,m,id,j,u,s,z,d,k,h,l,p,e]=r;
      const day=t?t.slice(0,10):(f.modal?f.modal+'-15':'');
      // Job ID 在影印機重置後會重複使用(實測 2023-12 與 2026-03 有 2,677 筆同號),不能單獨當唯一鍵
      const key=[id,u,t,j,l,h,m].join('|');
      if(seen.has(key)){st.dup++;continue;}
      seen.add(key);
      const cu=canonName(u);
      const o={i:R.length,f:fi,row,t,m,id,j,u:cu,u0:cu!==u?u:'',s,z,d,k,h,l,p,e,g:0,sh:f.sheet,day};
      o.ym=t?t.slice(0,7):f.modal;
      if(!day)st.nodate++;
      R.push(o);st.kept++;
    }
    DROP.dup+=st.dup;DROP.nodate+=st.nodate;
  });
  HAS_X=FILES.some(f=>f.hasX);
  for(const o of R){o.c=calc(o);o.sp=sheetsOf(o);o.a=acctOf(o.u);}
  // 疑似重複列印:同帳號+同檔名+同份數/面數/紙張,3 分鐘內再次送出(只看 Print;數字、太短、通用檔名不算)
  const last=new Map();
  for(const o of R.slice().sort((a,b)=>a.t<b.t?-1:a.t>b.t?1:a.i-b.i)){
    const nm=o.j.trim();
    if(o.m!=='Print'||!o.t||o.l<=0||nm.length<4||/^\d+$/.test(nm)||GENERIC_JOB.has(nm))continue;
    const key=[o.u,nm,o.h,o.l,o.z,o.d].join('|'),ms=Date.parse(o.t.replace(' ','T'));
    if(last.has(key)&&ms-last.get(key)<=180000)o.g=1;
    last.set(key,ms);
  }
  for(const o of R){
    o.fl=flagsOf(o);
    const st=FILES[o.f];st.calc+=o.c[3];
    if(Array.isArray(o.e))st.ex+=o.e[3];
    if(o.fl&F.MISS)st.nMiss++;
  }
  // 合併同人的顯示名稱
  const names=new Set([...REG_LIST,...R.map(o=>o.u)]),per={};
  for(const n of names){const a=acctOf(n);if(a.k!=='class')(per[a.p]=per[a.p]||[]).push(n);}
  PERSON_DISP={};
  for(const[p,ns]of Object.entries(per))PERSON_DISP[p]=ns.length===1?ns[0]:(ns.find(n=>n.toLowerCase()===p)||ns.find(n=>!PREFIX_RE.test(n))||p);
  // 期間選單相關
  ALL_YM=[...new Set(R.map(o=>o.ym).filter(Boolean))].sort();   // 無法判讀日期的列(ym 為空)不可進月份清單,否則 ymRange 會從西元 0 年開始跑
  YM_MIN=ALL_YM[0]||'';YM_MAX=ALL_YM[ALL_YM.length-1]||'';
  MIN_DAY='';MAX_DAY='';for(const o of R){if(!o.day)continue;if(!MIN_DAY||o.day<MIN_DAY)MIN_DAY=o.day;if(o.day>MAX_DAY)MAX_DAY=o.day;}
  MONTHS=ALL_YM.length?ymRange(YM_MIN,YM_MAX):[];
  SIZES=[...new Set(R.filter(o=>o.z).map(o=>o.z))].sort();
  STATUSES=[...new Set(R.map(o=>o.s).filter(Boolean))].sort();
  SEMS=[...new Set(ALL_YM.map(ym=>{const s=semOf(ym);return s.sy+'-'+s.t;}))].sort().reverse();
  SYS=[...new Set(SEMS.map(s=>s.split('-')[0]))];
  if(!presetRange(S.preset)&&S.preset!=='custom')S.preset='start';
  if(S.preset==='custom'&&(!S.from||!S.to))S.preset='start';
  if(S.preset!=='custom')applyPreset();
  if(S.preset==='start'&&MAX_DAY&&S.from>S.to){S.preset='all';applyPreset();}
}
function semOf(ym){const y=+ym.slice(0,4),m=+ym.slice(5);let sy,t;if(m>=8){sy=y;t=1}else if(m>=2){sy=y-1;t=2}else{sy=y-1;t=1}return{sy:sy-1911,t};}
function presetRange(p){
  if(!MIN_DAY)return(p==='all'||p==='start')?['','']:null;
  if(p==='all')return[MIN_DAY,MAX_DAY];
  if(p==='start')return[S.startDate,MAX_DAY];
  let a,b;
  if(p&&p.startsWith('sem:')){const[sy,t]=p.slice(4).split('-').map(Number);const y=sy+1911;[a,b]=t===1?[y+'-08-01',(y+1)+'-01-31']:[(y+1)+'-02-01',(y+1)+'-07-31'];}
  else if(p&&p.startsWith('sy:')){const y=+p.slice(3)+1911;a=y+'-08-01';b=(y+1)+'-07-31';}
  else return null;
  return[a<MIN_DAY?MIN_DAY:a,b>MAX_DAY?MAX_DAY:b];
}
function applyPreset(){const r=presetRange(S.preset);if(r){S.from=r[0];S.to=r[1];}}

/* ================= 狀態 ================= */
const S={
  tab:'overview',theme:P.theme||'auto',metric:P.metric||'fee',merge:!!P.merge,showJob:!!P.showJob,
  startDate:P.startDate||CONFIG.startDate,preset:P.preset||'start',from:'',to:'',
  cls:null,sortCls:false,cmpGrade:GRADES[1]?GRADES[1].code:GRADES[0].code,
  uq:'',ukind:'',uzero:true,usort:'val',udir:-1,upage:1,
  det:{q:'',cls:'',mode:'',status:'',size:'',flag:'',user:'',sort:'t',dir:-1,page:0},
  hi:500,
};
const fee=o=>o.c[3];
const userKey=o=>(S.merge&&o.a.k!=='class')?o.a.p:o.u;
const disp=k=>(S.merge&&PERSON_DISP[k])||k;
const clsOf=o=>o.a.k==='class'?o.a.c:0;
const METRIC={fee:'費用(元)',sheets:'張數',sides:'列印面數',jobs:'工作數'};
let CUR=[];
function refresh(){CUR=R.filter(o=>o.day>=S.from&&o.day<=S.to);}
function group(rows,keyFn){
  const M=new Map();
  for(const o of rows){const k=keyFn(o);if(k==null)continue;let g=M.get(k);if(!g){g={k,fee:0,sides:0,sheets:0,jobs:0,n:0};M.set(k,g);}g.fee+=fee(o);g.sides+=o.l;g.sheets+=o.sp;if(o.m!=='Scan')g.jobs++;g.n++;}
  return M;
}
const mv=g=>S.metric==='fee'?g.fee:S.metric==='sides'?g.sides:S.metric==='sheets'?g.sheets:g.jobs;
const fmtV=v=>S.metric==='fee'?fM(v):fI(v);
const sum=rows=>{const a={fee:0,sides:0,sheets:0,jobs:0,n:0};for(const o of rows){a.fee+=fee(o);a.sides+=o.l;a.sheets+=o.sp;if(o.m!=='Scan')a.jobs++;a.n++;}return a;};
const subjLabel=code=>{
  const parts=String(code).split('_').map(p=>CONFIG.subjects[p.toUpperCase()]||p);
  const zh=parts.join('-');return zh===code?code:code+' '+zh;
};
function periodText(){
  const ds=CUR.map(o=>o.day).filter(Boolean),dl=d=>d.replace(/-/g,'/');
  if(!ds.length)return S.from?dl(S.from)+'–'+dl(S.to):'—';
  const a=ds.reduce((x,y)=>x<y?x:y),b=ds.reduce((x,y)=>x>y?x:y);
  return a===b?dl(a):dl(a)+'–'+(a.slice(0,4)===b.slice(0,4)?dl(b).slice(5):dl(b));
}

/* ================= 共用元件 ================= */
function bars(items,max,opts={}){
  if(!items.length)return'<div class="empty">沒有資料</div>';
  return`<div class="bl" style="--lw:${opts.lw||56}px;--vw:${opts.vw||112}px">`+items.map(it=>{
    const w=max>0?Math.max(0,it.val/max*100):0;
    const tip=it.tip?` data-tip="${esc(it.tip)}"`:'';
    const act=it.act?` data-act="${it.act}" data-arg="${esc(it.arg)}"`:'';
    return`<button class="bl-row${it.on?' on':''}"${act}${tip}><span class="bl-l">${esc(it.label)}${it.sub?`<em>${esc(it.sub)}</em>`:''}</span><span class="bl-t"><i style="width:${w}%"></i></span><span class="bl-v">${esc(it.text)}${it.share!=null?`<em>${it.share}%</em>`:''}</span></button>`;
  }).join('')+'</div>';
}
const share=(v,t)=>t>0?Math.round(v/t*1000)/10:0;
function pill(t,c=''){return`<span class="pill ${c}">${esc(t)}</span>`;}
function csvText(rows){return rows.map(r=>r.map(c=>{if(c==null)c='';if(typeof c==='string'&&/^[=+\-@]/.test(c))c="'"+c;c=String(c);return/[",\n\r]/.test(c)?'"'+c.replace(/"/g,'""')+'"':c;}).join(',')).join('\r\n');}
function download(name,rows){
  const b=new Blob(['﻿'+csvText(rows)],{type:'text/csv;charset=utf-8'});
  const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
const stamp=()=>periodText().replace(/\//g,'').replace('–','-');

/* ================= 篩選列 / 分頁 ================= */
const TABS=[['overview','總覽'],['classes','班級'],['users','使用者'],['detail','明細'],['check','檢查']];
function renderFilters(){
  const opts=[['start','自 '+S.startDate.replace(/-/g,'/')+' 起(預設)'],['all','全部期間']]
    .concat(SEMS.map(s=>['sem:'+s,s+' 學期']))
    .concat(SYS.map(s=>['sy:'+s,s+' 學年(全年)']))
    .concat([['custom','自訂區間']]);
  $('#filters').innerHTML=`
    <label>期間 <select id="fPreset" aria-label="期間">${opts.map(([v,t])=>`<option value="${v}"${S.preset===v?' selected':''}>${t}</option>`).join('')}</select></label>
    <span style="display:inline-flex;gap:6px;align-items:center"><input type="date" id="fFrom" aria-label="起日" value="${S.from}">–<input type="date" id="fTo" aria-label="迄日" value="${S.to}"></span>
    <span class="seg" role="group" aria-label="指標">${Object.entries(METRIC).map(([k,t])=>`<button data-metric="${k}" aria-pressed="${S.metric===k}">${t}</button>`).join('')}</span>
    <details class="opt"><summary class="ghost">選項</summary><div class="pop">
      <label><input type="checkbox" id="oMerge"${S.merge?' checked':''}><span>合併同一人的帳號<small>ELE_x、EIGHT_x、x 視為同一人(僅影響「使用者」)</small></span></label>
      <label><input type="checkbox" id="oJob"${S.showJob?' checked':''}><span>顯示工作名稱(檔名)<small>含個資,分享畫面前請先關閉</small></span></label>
    </div></details>`;
  $('#tabs').innerHTML=TABS.map(([k,t])=>`<button role="tab" data-tab="${k}" aria-selected="${S.tab===k}">${t}${k==='check'?issueBadge():''}</button>`).join('');
}
function issueBadge(){const n=CUR.filter(o=>(o.fl&(F.MISS|F.DIFF))||((o.fl&F.UNREG)&&o.c[3]>0)).length;return n?`<span class="badge" title="需留意的列數">${n}</span>`:'';}

/* ================= 歡迎畫面(尚未有資料) ================= */
function viewWelcome(){
  return`<div class="welcome"><h2>把影印機的檔案放進來,就會自動統計</h2>
   <div class="hint">所有計算都在這台電腦的瀏覽器內完成,資料不會上傳到任何地方。</div>
   <div class="drop" id="dropZone">
     <div style="font-size:16px;font-weight:600">${canFS?'連結「資料」資料夾,之後新檔案放進去就會自動加入':'拖曳檔案或資料夾到這裡'}</div>
     <div class="row">${canFS?'<button class="btn" data-act="linkDir">連結「資料」資料夾</button><button class="btn alt" data-act="pickFiles">選擇檔案…</button>':'<button class="btn" data-act="pickDir">選擇「資料」資料夾</button><button class="btn alt" data-act="pickFiles">選擇檔案…</button>'}</div>
     <div class="hint">資料夾內可以再分年份資料夾(如 2025印量、2026印量),會一起讀取。也可以直接把檔案或資料夾拖進這個網頁。<br>支援:每月的「N月印量.xlsx」、影印機的帳號列表 .csv</div>
   </div>
   <div class="steps">${canFS?'① 按「連結「資料」資料夾」,選這個系統裡的 <b>資料</b> 資料夾(瀏覽器問是否允許檢視,請按允許)<br>② 之後每月:把新的 <b>N月印量.xlsx</b> 放進「資料」資料夾(可放在年份資料夾內),重新打開網頁或按「↻ 重新讀取」即可<br>　(網頁開著時,切回這個視窗也會自動檢查新檔案)':'① 按「選擇「資料」資料夾」,選 <b>資料</b> 資料夾(瀏覽器問「要上傳嗎?」請按「上傳」,只是讀取)<br>② 每月新增:把新的 <b>N月印量.xlsx</b> 拖進網頁(也請放進「資料」資料夾保存)<br>　(這個瀏覽器無法自動連結資料夾,建議改用 Chrome 或 Edge)'}<br>③ 影印機新增或刪除帳號後:把新匯出的帳號列表 .csv 也放進資料夾</div></div>`;
}

/* ================= 總覽 ================= */
function viewOverview(){
  const t=sum(CUR),acts=new Set(CUR.filter(o=>o.m!=='Scan'&&(o.l>0||fee(o)>0)).map(userKey)).size;
  const byKind=group(CUR,o=>o.a.k);
  const K=['class','staff','unknown'].map((k,i)=>({k,g:byKind.get(k)||{fee:0,sides:0,jobs:0},c:'c'+(i+1)}));
  const tot=K.reduce((a,x)=>a+mv(x.g),0);
  const heroV=S.metric==='fee'?t.fee:S.metric==='sides'?t.sides:S.metric==='sheets'?t.sheets:t.jobs;
  const heroL={fee:'期間總費用',sheets:'期間總張數(正反面算一張)',sides:'期間總列印面數',jobs:'期間總工作數'}[S.metric];
  const cls=[...group(CUR,o=>clsOf(o)||null).values()].sort((a,b)=>mv(b)-mv(a));
  const us=[...group(CUR,userKey).values()].sort((a,b)=>mv(b)-mv(a));
  const cmax=cls.length?mv(cls[0]):0,umax=us.length?mv(us[0]):0;
  const bySize=group(CUR.filter(o=>o.l>0),o=>o.z===A4?'A4':o.z===B4?'B4':o.z===A3?'A3':'其他尺寸');
  const byMode=group(CUR.filter(o=>o.m!=='Scan'),o=>o.m||'—');
  const sizeItems=['A4','B4','A3','其他尺寸'].map(k=>bySize.get(k)).filter(Boolean);
  const smax=Math.max(0,...sizeItems.map(mv));
  const nolist=!REG.size?`<div class="notice">尚未載入影印機的帳號列表,目前只能依帳號名稱推斷班級。<button class="ghost" data-act="pickFiles">載入帳號列表 .csv</button></div>`:'';
  return`${nolist}
  <div class="hero"><div class="lab">${heroL}</div>
    <div class="num">${fI(heroV)}<small>${S.metric==='fee'?'元':S.metric==='sides'?'面':S.metric==='sheets'?'張':'筆'}</small></div>
    <div class="hint">${periodText()} · ${fI(t.jobs)} 筆工作 · ${fI(acts)} 個${S.merge?'使用者':'帳號'}有用印</div></div>
  <div class="grid g3" style="margin:12px 0">
    ${S.metric!=='fee'?`<div class="card tile"><div class="lab">總費用(元)</div><div class="val">${fI(t.fee)}</div></div>`:''}
    ${S.metric!=='sheets'?`<div class="card tile"><div class="lab">張數(正反面算一張)</div><div class="val">${fI(t.sheets)}</div></div>`:''}
    ${S.metric!=='sides'?`<div class="card tile"><div class="lab">列印面數</div><div class="val">${fI(t.sides)}</div></div>`:''}
    ${S.metric!=='jobs'?`<div class="card tile"><div class="lab">工作數</div><div class="val">${fI(t.jobs)}</div></div>`:''}
    <div class="card tile"><div class="lab">平均每筆費用(元)</div><div class="val">${t.jobs?fM(Math.round(t.fee/t.jobs*100)/100):'—'}</div></div>
  </div>
  <div class="card"><div class="sech"><h2>誰在用 <small>${METRIC[S.metric]}</small></h2></div>
    <div class="comp" role="img" aria-label="帳號類型占比">${K.map(x=>`<i class="${x.c}" style="width:${tot?mv(x.g)/tot*100:0}%" data-tip="${esc(fmtV(mv(x.g))+'||'+KIND[x.k]+' · '+share(mv(x.g),tot)+'%')}"></i>`).join('')}</div>
    <div class="legend">${K.map(x=>`<button data-act="goKind" data-arg="${x.k}"><span class="sw ${x.c}"></span>${KIND[x.k]} <b>${fmtV(mv(x.g))}</b> <span class="mut">${share(mv(x.g),tot)}%</span></button>`).join('')}</div></div>
  <div class="card" style="margin-top:14px"><div class="sech"><h2>每月趨勢 <small>${METRIC[S.metric]}</small></h2><span>深色 = 目前期間 · 點長條只看該月</span></div>
    <div class="chart" id="mchart"></div>
    <details style="margin-top:6px"><summary class="hint" style="cursor:pointer">以表格檢視</summary>${monthTable()}</details></div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><div class="sech"><h2>各班用量 Top 8</h2><button class="lnk" data-act="tab" data-arg="classes">全部班級 →</button></div>
      ${bars(cls.slice(0,8).map(g=>({label:g.k+' 班',val:mv(g),text:fmtV(mv(g)),share:share(mv(g),tot),act:'goClass',arg:g.k,tip:fmtV(mv(g))+'||'+g.k+' 班 · '+fI(g.jobs)+' 筆'})),cmax)}</div>
    <div class="card"><div class="sech"><h2>使用者 Top 8</h2><button class="lnk" data-act="tab" data-arg="users">全部使用者 →</button></div>
      ${bars(us.slice(0,8).map(g=>({label:disp(g.k),val:mv(g),text:fmtV(mv(g)),share:share(mv(g),tot),act:'goUser',arg:g.k,tip:fmtV(mv(g))+'||'+disp(g.k)+' · '+fI(g.jobs)+' 筆'})),umax,{lw:128})}</div>
  </div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><div class="sech"><h2>紙張尺寸</h2><span>只計有列印面數的工作</span></div>
      ${bars(sizeItems.map(g=>({label:g.k,val:mv(g),text:fmtV(mv(g)),share:share(mv(g),sizeItems.reduce((a,x)=>a+mv(x),0)),tip:fmtV(mv(g))+'||'+g.k})),smax,{lw:72})}</div>
    <div class="card"><div class="sech"><h2>工作類型</h2><span>影印 / 列印(掃描不計費)</span></div>
      ${bars([...byMode.values()].sort((a,b)=>mv(b)-mv(a)).map(g=>({label:({Copy:'影印 Copy',Print:'列印 Print'})[g.k]||g.k,val:mv(g),text:fmtV(mv(g)),tip:fmtV(mv(g))+'||'+g.k})),Math.max(0,...[...byMode.values()].map(mv)),{lw:96})}</div>
  </div>`;
}
function monthTable(){
  const by=group(R,o=>o.ym);
  return`<div class="tw" style="margin-top:6px"><table><thead><tr><th>月份</th><th class="n">費用(元)</th><th class="n">列印面數</th><th class="n">工作數</th></tr></thead><tbody>${
    MONTHS.map(m=>{const g=by.get(m);return g?`<tr><td>${ymLabel(m)}</td><td class="n">${fM(g.fee)}</td><td class="n">${fI(g.sides)}</td><td class="n">${fI(g.jobs)}</td></tr>`:`<tr><td>${ymLabel(m)}</td><td colspan="3" class="mut">無資料</td></tr>`;}).join('')}</tbody></table></div>`;
}
function niceMax(v){if(v<=0)return 1;const p=Math.pow(10,Math.floor(Math.log10(v)));for(const m of[1,2,2.5,5,10]){if(v<=m*p)return m*p;}return 10*p;}
function drawMonthly(){
  const el=$('#mchart');if(!el)return;
  const by=group(R,o=>o.ym);
  const W=Math.max(280,el.clientWidth),H=220,ml=46,mr=6,mt=18,mb=24;
  const vals=MONTHS.map(m=>by.has(m)?mv(by.get(m)):null);
  const ymax=niceMax(Math.max(...vals.map(v=>v||0)));
  const iw=W-ml-mr,ih=H-mt-mb,slot=iw/MONTHS.length,bw=Math.min(24,slot*0.68),r=Math.min(4,bw/2);
  const Y=v=>mt+ih-(v/ymax)*ih;
  let s=`<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="每月${METRIC[S.metric]}">`;
  for(let i=0;i<=4;i++){const v=ymax/4*i,y=Y(v);s+=`<line class="${i?'gl':'ax'}" x1="${ml}" x2="${W-mr}" y1="${y}" y2="${y}"/><text x="${ml-6}" y="${y+4}" text-anchor="end">${fI(v)}</text>`;}
  const step=Math.max(1,Math.ceil(46/slot));
  const maxI=vals.reduce((bi,v,i)=>(v!=null&&v>(vals[bi]||0))?i:bi,0);
  MONTHS.forEach((m,i)=>{
    const cx=ml+slot*(i+.5),x=cx-bw/2,v=vals[i],inP=m>=S.from.slice(0,7)&&m<=S.to.slice(0,7);
    if((MONTHS.length-1-i)%step===0)s+=`<text x="${cx}" y="${H-6}" text-anchor="middle">${m.slice(2).replace('-','/')}</text>`;
    if(v==null){s+=`<line class="none" x1="${x}" x2="${x+bw}" y1="${Y(0)}" y2="${Y(0)}"/><rect class="hit" x="${cx-slot/2}" y="${mt}" width="${slot}" height="${ih}" data-tip="${esc('無資料檔||'+ymLabel(m))}"/>`;return;}
    const y=Y(v),h=Y(0)-y;
    const path=h<=r?`M${x},${Y(0)}V${Y(0)-Math.max(h,.5)}H${x+bw}V${Y(0)}Z`:`M${x},${Y(0)}V${y+r}Q${x},${y} ${x+r},${y}H${x+bw-r}Q${x+bw},${y} ${x+bw},${y+r}V${Y(0)}Z`;
    s+=`<path class="${inP?'in':'out'}" d="${path}"/>`;
    if(i===maxI&&v>0)s+=`<text class="val" x="${Math.min(W-mr-10,Math.max(ml+10,cx))}" y="${y-5}" text-anchor="middle">${fI(v)}</text>`;
    const g=by.get(m);
    s+=`<rect class="hit" x="${cx-slot/2}" y="${mt}" width="${slot}" height="${ih}" data-act="month" data-arg="${m}" data-tip="${esc(fmtV(v)+'||'+ymLabel(m)+' · '+fI(g.jobs)+' 筆 · '+fI(g.sides)+' 面')}"/>`;
  });
  el.innerHTML=s+'</svg>';
}

/* ================= 班級 ================= */
function viewClasses(){
  const by=group(CUR,o=>clsOf(o)||null);
  const tot=[...by.values()].reduce((a,g)=>a+mv(g),0);
  const max=Math.max(0,...[...by.values()].map(mv));
  const cards=GRADES.map(gr=>{
    let items=gr.classes.map(c=>({c,g:by.get(c)||{fee:0,sides:0,sheets:0,jobs:0}}));
    const sub=items.reduce((a,x)=>a+mv(x.g),0);
    if(S.sortCls)items=items.slice().sort((a,b)=>mv(b.g)-mv(a.g));
    return`<div class="card"><div class="sech"><h2>${gr.name} <small>${gr.level}</small></h2><span>合計 ${fmtV(sub)}</span></div>${
      bars(items.map(x=>({label:x.c+' 班',val:mv(x.g),text:fmtV(mv(x.g)),share:share(mv(x.g),tot),act:'selClass',arg:x.c,on:S.cls===x.c,tip:fmtV(mv(x.g))+'||'+x.c+' 班 · '+fI(x.g.jobs)+' 筆 · '+fI(x.g.sides)+' 面'+(CONFIG.sizes[x.c]?' · 每人 '+fM(Math.round(x.g.fee/CONFIG.sizes[x.c]*100)/100)+' 元':'')})),max)}</div>`;
  }).join('');
  return`
  <div class="bar-row"><span class="hint">${periodText()} · 「班級」= 帳號名稱為 <b>科目_班號</b>(如 MATH_203、CLASS_804)的用量加總</span><span class="sp"></span>
    <label class="hint"><input type="checkbox" id="cSort"${S.sortCls?' checked':''}> 各年級內由高到低</label>
    <button class="ghost" data-act="exportClasses">匯出各班 CSV</button></div>
  <div class="grid g2">${cards}</div>
  <div id="clsDetail" style="margin-top:14px">${S.cls?classDetail(S.cls):'<div class="card hint">點任一班級,可查看該班各科目與帳號的明細。</div>'}</div>
  <div class="card" style="margin-top:14px"><div class="sech"><h2>同科不同班比較 <small>${METRIC[S.metric]}</small></h2>
    <span><select id="cmpGrade" aria-label="年級">${GRADES.map(g=>`<option value="${g.code}"${S.cmpGrade===g.code?' selected':''}>${g.name}</option>`).join('')}</select>
    <button class="ghost" data-act="exportCmp">匯出 CSV</button></span></div>${cmpTable()}</div>`;
}
// 預收款與結餘:每人預收 × 人數 − 目前期間的用量(預收是每學期一次,請把期間選成該學期)
function budgetOf(c){const g=CLASS_LEVEL[c],n=CONFIG.sizes[c],per=g&&CONFIG.prepaid[g.code];return n&&per?{n,per,total:n*per}:null;}
function budgetLine(c,used){
  const b=budgetOf(c);if(!b)return'';
  const left=b.total-used;
  return`<div class="hint" style="margin-bottom:8px">預收 ${b.n} 人 × ${b.per} 元 = <b>${fI(b.total)}</b> 元 · 目前期間已用 <b>${fM(used)}</b> 元 · ${left>=0?`結餘 <b class="ok">${fM(left)}</b> 元`:`<b class="bad">不足 ${fM(-left)} 元</b>`}(預收以學期計,請把「期間」選成該學期)</div>`;
}
function classDetail(c){
  const rows=CUR.filter(o=>clsOf(o)===c),t=sum(rows);
  const bs=[...group(rows,o=>o.a.s).values()].sort((a,b)=>mv(b)-mv(a));
  const ba=[...group(rows,o=>o.u).values()].sort((a,b)=>mv(b)-mv(a));
  const tot=bs.reduce((a,g)=>a+mv(g),0);
  return`<div class="card"><div class="sech"><h2>${c} 班 <small>${periodText()}</small></h2><span><button class="ghost" data-act="goClassRows" data-arg="${c}">看逐筆明細 →</button> <button class="ghost" data-act="selClass" data-arg="">收合</button></span></div>
   <div class="hint" style="margin-bottom:8px">費用 <b>${fM(t.fee)}</b> 元 · 張數 <b>${fI(t.sheets)}</b> · 面數 <b>${fI(t.sides)}</b> · 工作 <b>${fI(t.jobs)}</b> 筆 · ${ba.length} 個帳號${CONFIG.sizes[c]?` · ${CONFIG.sizes[c]} 人,每人平均 <b>${fM(Math.round(t.fee/CONFIG.sizes[c]*100)/100)}</b> 元 / ${fI(Math.round(t.sides/CONFIG.sizes[c]))} 面`:''}</div>${budgetLine(c,t.fee)}
   <div class="grid g2"><div><div class="sech"><h3>依科目</h3></div>${bars(bs.map(g=>({label:g.k||'—',sub:CONFIG.subjects[String(g.k).toUpperCase()]||'',val:mv(g),text:fmtV(mv(g)),share:share(mv(g),tot),tip:fmtV(mv(g))+'||'+subjLabel(g.k)})),bs.length?mv(bs[0]):0,{lw:120})}</div>
   <div><div class="sech"><h3>依帳號</h3></div><div class="tw"><table><thead><tr><th>帳號</th><th class="n">${METRIC[S.metric]}</th><th class="n">筆數</th></tr></thead><tbody>${
     ba.map(g=>`<tr data-act="goUser" data-arg="${esc(g.k)}"><td><button class="lnk">${esc(g.k)}</button></td><td class="n">${fmtV(mv(g))}</td><td class="n">${fI(g.jobs)}</td></tr>`).join('')}</tbody></table></div></div></div></div>`;
}
function cmpData(){
  const gr=GRADES.find(g=>g.code===S.cmpGrade);
  const rows=CUR.filter(o=>o.a.k==='class'&&gr.classes.includes(o.a.c));
  const M=new Map();
  for(const o of rows){let m=M.get(o.a.s);if(!m){m=new Map();M.set(o.a.s,m);}let g=m.get(o.a.c);if(!g){g={fee:0,sides:0,sheets:0,jobs:0};m.set(o.a.c,g);}g.fee+=fee(o);g.sides+=o.l;g.sheets+=o.sp;if(o.m!=='Scan')g.jobs++;}
  const subs=[...M.keys()].map(s=>({s,tot:gr.classes.reduce((a,c)=>a+(M.get(s).has(c)?mv(M.get(s).get(c)):0),0)})).sort((a,b)=>b.tot-a.tot);
  return{gr,M,subs};
}
function cmpTable(){
  const{gr,M,subs}=cmpData();
  if(!subs.length)return'<div class="empty">此年級在所選期間沒有資料</div>';
  const cell=(s,c)=>M.get(s).has(c)?mv(M.get(s).get(c)):0;
  const mx=Math.max(1,...subs.flatMap(x=>gr.classes.map(c=>cell(x.s,c))));
  const colTot=gr.classes.map(c=>subs.reduce((a,x)=>a+cell(x.s,c),0));
  return`<div class="tw"><table class="heat"><thead><tr><th>科目</th>${gr.classes.map(c=>`<th class="n">${c}</th>`).join('')}<th class="n">合計</th></tr></thead><tbody>${
    subs.map(x=>`<tr><td>${esc(subjLabel(x.s))}</td>${gr.classes.map(c=>{const v=cell(x.s,c);if(!v)return'<td class="z">–</td>';const p=Math.round(8+v/mx*77);return`<td style="background:color-mix(in srgb,var(--s1) ${p}%,var(--surface));${p>52?'color:#fff':''}" data-tip="${esc(fmtV(v)+'||'+subjLabel(x.s)+' · '+c+' 班')}">${fmtV(v)}</td>`;}).join('')}<td><b>${fmtV(x.tot)}</b></td></tr>`).join('')}</tbody><tfoot><tr><td>合計</td>${colTot.map(v=>`<td>${fmtV(v)}</td>`).join('')}<td>${fmtV(colTot.reduce((a,b)=>a+b,0))}</td></tr></tfoot></table></div>
  <div class="hint" style="margin-top:6px">顏色越深 = 用量越高;「–」= 該班該科沒有紀錄。</div>`;
}

/* ================= 使用者 ================= */
function userRows(){
  const by=group(CUR,userKey);
  const mem=new Map();
  const addMem=(k,n)=>{let s=mem.get(k);if(!s){s=new Set();mem.set(k,s);}s.add(n);};
  for(const o of CUR)addMem(userKey(o),o.u);
  if(!S.uzero)for(const n of REG_LIST){const a=acctOf(n),k=(S.merge&&a.k!=='class')?a.p:n;if(!by.has(k))by.set(k,{k,fee:0,sides:0,sheets:0,jobs:0,n:0});addMem(k,n);}
  let rows=[...by.values()].map(g=>{const ms=mem.get(g.k)||new Set([g.k]);const a=acctOf([...ms][0]);return{...g,key:g.k,name:disp(g.k),kind:a.k,cls:a.k==='class'?a.c:0,val:mv(g),members:ms,reg:a.reg};});
  if(S.ukind)rows=rows.filter(r=>r.kind===S.ukind);
  if(S.uq){const q=S.uq.toLowerCase();rows=rows.filter(r=>r.name.toLowerCase().includes(q)||r.key.toLowerCase().includes(q)||[...r.members].some(m=>m.toLowerCase().includes(q)));}
  if(S.uzero)rows=rows.filter(r=>r.val>0);
  const k=S.usort,d=S.udir;
  rows.sort((a,b)=>{const x=a[k],y=b[k];return(typeof x==='string'?x.localeCompare(y):x-y)*d||a.name.localeCompare(b.name);});
  return rows;
}
function viewUsers(){
  return`<div class="bar-row">
    <input type="search" id="uq" placeholder="搜尋帳號…" value="${esc(S.uq)}" aria-label="搜尋帳號">
    <select id="ukind" aria-label="帳號類型"><option value="">全部類型</option>${Object.entries(KIND).map(([k,t])=>`<option value="${k}"${S.ukind===k?' selected':''}>${t}</option>`).join('')}</select>
    <label class="hint"><input type="checkbox" id="uzero"${S.uzero?' checked':''}> 隱藏 0 用量</label>
    <span class="sp"></span><button class="ghost" data-act="exportUsers">匯出 CSV</button></div>
    <div id="utbl"></div>`;
}
function renderUsersTable(){
  const rows=userRows(),tot=rows.reduce((a,r)=>a+r.val,0),PS=100,show=rows.slice(0,PS*S.upage);
  const th=(k,t,n)=>`<th class="${n?'n':''}"><button data-act="sortU" data-arg="${k}" aria-label="依${t}排序">${t}${S.usort===k?(S.udir<0?' ▾':' ▴'):''}</button></th>`;
  const max=rows.length?Math.max(...rows.map(r=>r.val)):0;
  $('#utbl').innerHTML=`<div class="hint" style="margin-bottom:6px">${fI(rows.length)} 個${S.merge?'使用者':'帳號'} · 合計 ${fmtV(tot)}(${METRIC[S.metric]}) · 點列可看逐筆明細${REG.size&&S.uzero?` · 影印機共登錄 ${fI(REG.size)} 個帳號(取消「隱藏 0 用量」可看全部)`:''}</div>
   <div class="tw tall"><table><thead><tr><th class="n">#</th>${th('name','帳號')}${th('kind','類型')}${th('cls','班級',1)}${th('fee','費用(元)',1)}${th('sheets','張數',1)}${th('sides','面數',1)}${th('jobs','工作數',1)}<th class="n" title="每位老師每學期 ${CONFIG.teacherQuota} 元額度">個人額度餘額</th><th>占比</th></tr></thead><tbody>${
    show.map((r,i)=>`<tr data-act="goUser" data-arg="${esc(r.key)}"><td class="n mut">${i+1}</td><td><button class="lnk"${r.members.size>1?` data-tip="${esc('合併帳號||'+[...r.members].join('、'))}"`:''}>${esc(r.name)}</button>${r.members.size>1?` <span class="pill k">${r.members.size} 帳號</span>`:''}${r.kind==='unknown'?' '+pill('未登錄','w'):''}${tagOf(r.name)?' '+pill(tagOf(r.name),'k'):''}</td><td>${KIND[r.kind]}</td><td class="n">${r.cls||''}</td><td class="n">${fM(r.fee)}</td><td class="n">${fI(r.sheets)}</td><td class="n">${fI(r.sides)}</td><td class="n">${fI(r.jobs)}</td><td class="n">${r.kind==='staff'?(r.fee<=CONFIG.teacherQuota?fM(CONFIG.teacherQuota-r.fee):pill('超出 '+fM(r.fee-CONFIG.teacherQuota),'e')):''}</td><td style="min-width:110px"><div class="bl-t" style="height:10px"><i style="width:${max?r.val/max*100:0}%;position:absolute;left:0;top:0;bottom:0;background:var(--s1);border-radius:0 4px 4px 0;min-width:${r.val>0?2:0}px"></i></div></td></tr>`).join('')}</tbody></table></div>
   ${rows.length>show.length?`<div class="pager"><span>已顯示 ${show.length} / ${rows.length}</span><button class="ghost" data-act="moreU">再顯示 100 筆</button></div>`:''}`;
}

/* ================= 明細(人工檢驗) ================= */
const FLAGS=[['','全部'],['unreg','帳號未登錄於影印機'],['fixed','帳號名稱已自動更正(空白/大小寫等)'],['miss','Excel 費用欄空白(缺公式)'],['diff','重算與 Excel 不同'],['part','未正常結束(非 Done)卻有計費'],['odd','非 A4/B4/A3 紙張'],['dup','疑似重複列印'],['high','單筆金額偏高']];
function detFilter(){
  const d=S.det,q=d.q.trim().toLowerCase();
  return CUR.filter(o=>{
    if(d.user&&userKey(o)!==d.user)return false;
    if(d.cls){const c=clsOf(o);if(d.cls==='none'?c!==0:d.cls==='any'?c===0:String(c)!==d.cls)return false;}
    if(d.mode&&o.m!==d.mode)return false;
    if(d.status&&o.s!==d.status)return false;
    if(d.size&&o.z!==d.size)return false;
    if(d.flag){
      if(d.flag==='high'){if(o.c[3]<S.hi)return false;}
      else if(!(o.fl&({unreg:F.UNREG,fixed:F.FIXED,miss:F.MISS,diff:F.DIFF,part:F.PART,odd:F.ODD,dup:F.DUP})[d.flag]))return false;
    }
    if(q&&!(o.u.toLowerCase().includes(q)||o.j.toLowerCase().includes(q)||String(o.row)===q||o.id===q))return false;
    return true;
  });
}
function viewDetail(){
  const d=S.det;
  return`<div class="bar-row">
    <input type="search" id="dq" placeholder="搜尋帳號/檔名/Excel列號/Job ID" value="${esc(d.q)}" aria-label="搜尋">
    <select id="dcls" aria-label="班級"><option value="">全部帳號</option><option value="any"${d.cls==='any'?' selected':''}>所有班級帳號</option><option value="none"${d.cls==='none'?' selected':''}>非班級帳號</option>${ALL_CLASSES.map(c=>`<option value="${c}"${d.cls==String(c)?' selected':''}>${c} 班</option>`).join('')}</select>
    <select id="dmode" aria-label="工作類型"><option value="">全部類型</option>${['Copy','Print','Scan'].map(m=>`<option${d.mode===m?' selected':''}>${m}</option>`).join('')}</select>
    <select id="dstatus" aria-label="狀態"><option value="">全部狀態</option>${STATUSES.map(m=>`<option${d.status===m?' selected':''}>${esc(m)}</option>`).join('')}</select>
    <select id="dsize" aria-label="紙張"><option value="">全部紙張</option>${SIZES.map(m=>`<option${d.size===m?' selected':''}>${esc(m)}</option>`).join('')}</select>
    <select id="dflag" aria-label="檢查項目">${FLAGS.map(([v,t])=>`<option value="${v}"${d.flag===v?' selected':''}>${v?'⚑ ':''}${t}${v==='high'?'(≥'+S.hi+' 元)':''}</option>`).join('')}</select>
    ${d.user?`<span class="chip">帳號:${esc(disp(d.user))}<button data-act="clearUser" aria-label="清除帳號篩選">×</button></span>`:''}
    <button class="ghost" data-act="resetDet">清除篩選</button></div>
    <div id="dtbl"></div>`;
}
const cmpBy={cls:(a,b)=>clsOf(a)-clsOf(b)||(a.t<b.t?-1:a.t>b.t?1:a.i-b.i),t:(a,b)=>a.t<b.t?-1:a.t>b.t?1:a.i-b.i,u:(a,b)=>a.u.localeCompare(b.u),m:(a,b)=>a.m.localeCompare(b.m),s:(a,b)=>a.s.localeCompare(b.s),z:(a,b)=>a.z.localeCompare(b.z),l:(a,b)=>a.l-b.l,fee:(a,b)=>fee(a)-fee(b),row:(a,b)=>a.f-b.f||a.row-b.row,j:(a,b)=>a.j.localeCompare(b.j)};
const PAGE=100;
const srcText=o=>FILES[o.f].name.replace(/\.[^.]+$/,'')+' #'+o.row;
function flagPills(o){
  let s='';
  if(o.fl&F.UNREG)s+=pill('未登錄','w');
  if(o.fl&F.FIXED)s+=`<span class="pill k" data-tip="${esc('帳號名稱已自動更正||原始寫法:「'+o.u0+'」')}">名稱已更正</span>`;
  if(o.fl&F.MISS)s+=pill('Excel缺公式','w');
  if(o.fl&F.DIFF)s+=pill('與Excel不同','e');
  if(o.fl&F.PART)s+=pill(o.s,'w');
  if(o.fl&F.ODD)s+=pill('特殊紙張','w');
  if(o.fl&F.DUP)s+=pill('疑重複','w');
  if(o.c[3]>=S.hi)s+=pill('金額高','w');
  return s;
}
function feeCells(o){
  return o.c.map((v,i)=>`<td class="n${i<3?' opt-col':''}">${fM(v)}</td>`).join('');
}
function renderDetTable(){
  const d=S.det;
  const rows=detFilter().sort((a,b)=>cmpBy[d.sort](a,b)*d.dir);
  const t=sum(rows),pages=Math.max(1,Math.ceil(rows.length/PAGE));
  if(d.page>=pages)d.page=pages-1;
  const show=rows.slice(d.page*PAGE,d.page*PAGE+PAGE);
  const th=(k,t,n,cls='')=>`<th class="${n?'n ':''}${cls}"><button data-act="sortD" data-arg="${k}" aria-label="依${t}排序">${t}${d.sort===k?(d.dir<0?' ▾':' ▴'):''}</button></th>`;
  const hasJ=S.showJob;
  $('#dtbl').innerHTML=`
   <div class="bar-row"><span><b>${fI(rows.length)}</b> 筆符合 · 費用合計 <b>${fM(t.fee)}</b> 元 · 張數 <b>${fI(t.sheets)}</b> · 面數 <b>${fI(t.sides)}</b> · 期間 ${periodText()}</span><span class="sp"></span>
     <button class="ghost" data-act="exportDet">匯出這些列 CSV</button></div>
   <div class="tw tall"><table><thead><tr>${th('t','時間')}${th('u','帳號')}${th('cls','班級',0,'opt-col')}${th('m','類型',0,'opt-col')}${hasJ?th('j','工作名稱'):''}${th('s','狀態')}${th('z','紙張',0,'opt-col')}<th class="opt-col">單/雙</th><th class="n opt-col">份</th>${th('l','面數',1)}<th class="n">張</th><th class="n opt-col">頁</th><th class="n opt-col">列印費</th><th class="n opt-col">裝訂費</th><th class="n opt-col">紙張費</th>${th('fee','總費用',1)}<th>標記</th>${th('row','來源(Excel)')}<th></th></tr></thead><tbody>${
   show.map(o=>`<tr><td>${esc(o.t||'—')}</td><td><button class="lnk" data-act="goUser" data-arg="${esc(userKey(o))}">${esc(o.u)}</button></td><td class="opt-col">${clsOf(o)||''}</td><td class="opt-col">${esc(o.m)}</td>${hasJ?`<td class="wrap-t">${esc(o.j)}</td>`:''}<td>${esc(o.s)}</td><td class="opt-col">${esc(o.z.replace(/ .*/,'')||'')}</td><td class="opt-col">${o.d==='Duplex'?'雙':o.d==='Simplex'?'單':''}</td><td class="n opt-col">${fI(o.h)}</td><td class="n">${fI(o.l)}</td><td class="n">${fI(o.sp)}</td><td class="n opt-col">${fI(o.p)}</td>${feeCells(o)}<td>${flagPills(o)}</td><td><span data-tip="${esc(FILES[o.f].name+' › '+o.sh+'||第 '+o.row+' 列'+(o.id?' · Job ID '+o.id:''))}">${esc(srcText(o))}</span></td><td><button class="lnk" data-act="explain" data-arg="${o.i}">算式</button></td></tr>`).join('')||'<tr><td colspan="19" class="empty">沒有符合的資料</td></tr>'}</tbody></table></div>
   <div class="pager"><button class="ghost" data-act="pg" data-arg="-1"${d.page<=0?' disabled':''}>← 上一頁</button><span>第 ${d.page+1} / ${pages} 頁(每頁 ${PAGE} 筆)</span><button class="ghost" data-act="pg" data-arg="1"${d.page>=pages-1?' disabled':''}>下一頁 →</button></div>`;
}

/* ================= 算式說明 / 試算 ================= */
function explain(o){
  const r=rateOf(o.z),L=o.l,M=o.p,H=o.h,sz=o.z||'(未記錄)';
  const rn=o.z===A4?'A4':o.z===B4?'B4':o.z===A3?'A3':'其他尺寸';
  const c=calc(o);
  const lines=[];
  lines.push(['紙張',`${esc(sz)} → ${rn} → 每面 <b>${r}</b> 元${(o.z!==A4&&o.z!==B4&&o.z!==A3)?'(非 A4/B4 一律以 0.4 計)':''}`]);
  lines.push(['列印費',`${r} × 列印面數 ${fI(L)} = <b>${fM(c[0])}</b>`]);
  const sp=o.k==='1 position'?0.25:o.k==='2 positions'?0.5:0;
  lines.push(['裝訂費',`裝訂「${esc(o.k||'—')}」每份 ${sp} 元 × 份數 ${fI(H)} = <b>${fM(c[1])}</b>`]);
  if(L===0)lines.push(['紙張費',`列印面數為 0 → <b>0</b>`]);
  else{
    const simp=o.d==='Simplex',odd=M%2===1;
    const extra=simp?0:(odd?H:0),fac=(M===1||simp)?1:0.5;
    lines.push(['紙張費',`${r} × (列印面數 ${fI(L)} + 補計 ${fI(extra)} × ${fac}) = <b>${fM(c[2])}</b><br><span class="hint">補計:${simp?'單面 → 不補計':odd?`雙面且頁數 ${fI(M)} 為奇數 → 補計 份數 ${fI(H)}(頁數=1 或單面 係數 1,其餘 0.5)`:`雙面且頁數 ${fI(M)} 為偶數 → 不補計`}</span>`]);
  }
  return{lines,c};
}
function explainHtml(o,extra=''){
  const{lines,c}=explain(o);
  return`<dl class="calc">${lines.map(([a,b])=>`<dt>${a}</dt><dd>${b}</dd>`).join('')}<dt class="tot">總費用</dt><dd class="tot">${fM(c[0])} + ${fM(c[1])} + ${fM(c[2])} = ${fM(c[3])} 元</dd></dl>${extra}`;
}
function openExplain(i){
  const o=R[i],f=FILES[o.f];
  let ex='';
  if(o.e===null)ex='<p class="bad">Excel 此列的費用欄是空白(沒有公式),用 Excel 直接加總會漏算這筆。網頁已依公式計入。</p>';
  else if(Array.isArray(o.e)&&(o.fl&F.DIFF))ex=`<p class="bad">與 Excel 原值不同:Excel 記錄 ${o.e.map(fM).join(' / ')}</p>`;
  else if(Array.isArray(o.e))ex=`<p class="ok">✓ 與 Excel「工作表2」的費用一致(${o.e.map(fM).join(' / ')})</p>`;
  $('#dlgBody').innerHTML=`<h2 style="margin:0 0 4px;font-size:16px">${esc(o.u)} · ${esc(o.m)} · ${esc(o.t||'')}</h2>
   <div class="hint">${esc(f.name)} › ${esc(o.sh)} › 第 ${o.row} 列${o.id?' · Job ID '+esc(o.id):''} · 狀態 ${esc(o.s)}</div>
   <div class="hint">份數 ${fI(o.h)} · 列印面數 ${fI(o.l)} · 頁數 ${fI(o.p)} · ${esc(o.d||'—')}${o.a.reg?'':' · <b>帳號未登錄於影印機</b>'}</div>${explainHtml(o,ex)}`;
  $('#dlg').showModal();
}

/* ================= 檢查 ================= */
function viewCheck(){
  const cnt=m=>CUR.filter(o=>o.fl&m),amt=rows=>rows.reduce((a,o)=>a+o.c[3],0);
  const fixed=cnt(F.FIXED);
  const fixedTxt=[...group(fixed,o=>o.u0+'\u0001'+o.u).values()].map(g=>{const[a,b]=g.k.split('\u0001');return`「${esc(a)}」→ ${esc(b)}(${g.n})`;}).slice(0,12).join('、');
  const unreg=cnt(F.UNREG),miss=cnt(F.MISS),diff=cnt(F.DIFF),part=cnt(F.PART),odd=cnt(F.ODD),dup=cnt(F.DUP),high=CUR.filter(o=>o.c[3]>=S.hi);
  const scan=CUR.filter(o=>o.m==='Scan');
  const item=(sev,title,rows,desc,flag,extraHtml='')=>{
    const n=rows.length,ico=n===0?'<span class="ok icon">✓</span>':sev==='e'?'<span class="bad icon">✕</span>':sev==='i'?'<span class="icon mut">•</span>':'<span class="icon" style="color:var(--warnink)">▲</span>';
    return`<div class="issue"><h4>${ico}${title}</h4><p>${desc}${extraHtml}</p><div class="r"><div class="cnt">${fI(n)}<small class="hint"> 筆</small></div>${n&&rows[0].c?`<div class="hint">${fM(amt(rows))} 元</div>`:''}${n&&flag?`<button class="ghost" data-act="goFlag" data-arg="${flag}" style="margin-top:4px">看明細</button>`:''}</div></div>`;
  };
  const unregBy=[...group(unreg,o=>o.u).values()].sort((a,b)=>b.fee-a.fee||b.n-a.n);
  const unregTxt=unregBy.slice(0,14).map(g=>{const a=acctOf(g.k);return`${esc(g.k)}(${g.n}筆${a.guess?`,疑似 ${a.guess} 班`:''})`;}).join('、')+(unregBy.length>14?`…共 ${unregBy.length} 個`:'');
  const oddBy=[...group(odd,o=>o.z||'(空白)').values()].sort((a,b)=>b.fee-a.fee).map(g=>`${esc(g.k)}:${g.n} 筆`).join('、');
  const gaps=MONTHS.filter(m=>!ALL_YM.includes(m)).map(ymLabel);
  const byKind=group(CUR,o=>o.a.k),tk=k=>byKind.has(k)?byKind.get(k).fee:0,cur=sum(CUR);
  const okSum=Math.abs(tk('class')+tk('staff')+tk('unknown')-cur.fee)<0.001;
  const fm=FILES.map(()=>new Set());for(const o of R)if(o.ym)fm[o.f].add(+o.ym.slice(5));
  const fileRows=FILES.map((f,fi)=>{
    const nm=(f.name.match(/(\d{1,2})月/)||[])[1],months=fm[fi];
    const monthBad=nm&&months.size&&!months.has(+nm);
    return{f,monthBad,nm};
  });
  const T=FILES.reduce((a,f)=>({read:a.read+f.read,kept:a.kept+f.kept,calc:a.calc+f.calc,ex:a.ex+f.ex,miss:a.miss+f.nMiss}),{read:0,kept:0,calc:0,ex:0,miss:0});
  const jsMis=diff.length,jsChecked=R.filter(o=>Array.isArray(o.e)).length;
  const used=new Set(CUR.map(o=>o.u)),unused=REG_LIST.filter(n=>!used.has(n)).length;
  return`
  <div class="grid g2">
   <div class="card"><div class="sech"><h2>檢查清單 <small>${periodText()}</small></h2></div>
    ${item('i','帳號名稱自動更正',fixed,`前後或多餘空白、全形字、隱藏字元、大小寫與影印機列表不同的名稱,已自動改成列表上的寫法後才統計(原始寫法在明細可查)。${fixedTxt?'<br>'+fixedTxt:''}`,'fixed')}
    ${REG.size?item('w','帳號未登錄於影印機帳號列表',unreg,`這些帳號不在目前的影印機帳號列表內(可能已刪除、或打錯名稱),所以不會算進任何班級。${unregTxt?'<br>'+unregTxt:''}${unregBy.length?`<br><button class="lnk" data-act="exportUnreg">下載這份清單(可填「班級」後放進資料夾,即可歸班)</button>`:''}`,'unreg'):item('i','尚未載入帳號列表',[],'請把影印機匯出的帳號列表 .csv 拖進網頁。','')}
    ${HAS_X?item('e','Excel「工作表2」費用欄空白(缺公式)',miss,`該列 N:Q 沒有公式,用 Excel 直接加總會漏算;網頁一律以公式重算,不受影響。`,'miss')+item('e','重算結果 ≠ Excel 原值',diff,'比對 Excel 已算好的總費用與網頁公式重算;有人手改過金額或公式時會出現。','diff'):item('i','Excel 費用對照',[],'讀入的檔案沒有含費用欄的工作表,略過與 Excel 的比對。','')}
    ${item('w','未正常結束(Suspend/Error)卻有計費',part,'這些工作的「列印面數」大於 0,多半是列印到一半中斷;請確認是否該計費。','part')}
    ${item('w','非 A4 / B4 / A3 的紙張',odd,`依公式一律以 0.4 元/面計。${oddBy?'分佈:'+oddBy:''}`,'odd')}
    ${item('w','疑似重複列印',dup,'同帳號、同檔名、同份數面數,3 分鐘內再次送出(可能是卡紙重印或誤按;批次列印多份也會被標出,請人工判斷)。','dup')}
    ${item('w',`單筆金額 ≥ <input type="number" id="hiIn" value="${S.hi}" min="1" style="width:76px;min-height:26px;padding:1px 6px"> 元`,high,'金額特別大的工作,建議抽查是否為大量講義/考卷。','high')}
    ${item('i','掃描(Scan)工作',scan,'掃描不計費,只列出筆數。','')}
   </div>
   <div class="card"><div class="sech"><h2>對帳 <small>${periodText()}</small></h2></div>
     <dl class="calc">
      <dt>班級/科任帳號</dt><dd>${fM(tk('class'))}</dd>
      <dt>其他已登錄帳號</dt><dd>${fM(tk('staff'))}</dd>
      <dt>未登錄帳號</dt><dd>${fM(tk('unknown'))}</dd>
      <dt class="tot">合計</dt><dd class="tot">${fM(cur.fee)} ${okSum?'<span class="ok">✓ 三類相加 = 總計</span>':'<span class="bad">✕ 不一致</span>'}</dd>
     </dl>
     ${HAS_X?`<p class="${jsMis===0?'ok':'bad'}" style="margin:6px 0 0">${jsMis===0?'✓':'✕'} 公式重算 vs Excel 原值:比對 ${fI(jsChecked)} 列,不一致 ${jsMis} 列</p>`:''}
     <p class="hint" style="margin:8px 0 0">預設起算日 <b>${S.startDate}</b>(可在上方「期間」改成任何區間);重複的工作 ${fI(DROP.dup)} 筆未重複計算。${DROP.nodate?`<br><span style="color:var(--warnink)">▲</span> 有 ${fI(DROP.nodate)} 筆讀不到列印時間(多為掃描),不屬於任何期間,不會出現在統計中。`:''}<br>
     帳號列表:${REG.size?`${esc(SRC.accounts.name)},共 ${fI(REG.size)} 個帳號,本期未使用 ${fI(unused)} 個`:'尚未載入'}${SRC.mapping?`;帳號對照表 ${SRC.mapping.rows.length} 筆`:''}<br>
     ${fileRows.some(x=>x.monthBad)?`<span style="color:var(--warnink)">▲</span> 檔名月份與實際列印日期不符:${fileRows.filter(x=>x.monthBad).map(x=>esc(x.f.name)+`(資料為 ${x.f.dmin} ~ ${x.f.dmax})`).join('、')}。網頁的月份以「實際列印日期」為準。<br>`:''}${gaps.length?`<span style="color:var(--warnink)">▲</span> 這些月份沒有任何資料:${gaps.join('、')}。`:(MONTHS.length?'<span class="ok">✓</span> 各月份都有資料。':'')}</p>
   </div>
  </div>
  <div class="card" style="margin-top:14px"><div class="sech"><h2>各檔對帳 <small>不受上方期間影響</small></h2><span class="hint">Excel 對照:開啟該檔「工作表2」,對 Q 欄(總費用)求和</span></div>
   <div class="tw"><table><thead><tr><th>檔案</th><th>資料來源</th><th>資料日期</th><th class="n">讀入列數</th><th class="n">計入</th><th class="n">網頁費用合計</th>${HAS_X?'<th class="n">Excel Q欄加總</th><th class="n">Excel 缺公式列</th><th class="n">差額</th>':''}</tr></thead><tbody>${
    fileRows.map(x=>{const f=x.f;return`<tr><td>${esc(f.name)}</td><td>${esc(f.sheet)}</td><td>${f.dmin?f.dmin.slice(2)+' ~ '+f.dmax.slice(5):'—'}${x.monthBad?' '+pill('月份不符','w'):''}</td><td class="n">${fI(f.read)}</td><td class="n">${fI(f.kept)}${f.dup?` <span class="hint" data-tip="${esc('未重複計算||與其他檔案重複 '+f.dup+' 筆')}">(-${f.dup})</span>`:''}</td><td class="n"><b>${fM(f.calc)}</b></td>${HAS_X?(f.hasX?`<td class="n">${fM(f.ex)}</td><td class="n">${f.nMiss||''}</td><td class="n${Math.abs(f.calc-f.ex)>0.001?' bad':''}">${Math.abs(f.calc-f.ex)>0.001?fM(f.calc-f.ex):'0'}</td>`:'<td class="n mut">—</td><td></td><td></td>'):''}</tr>`;}).join('')||'<tr><td colspan="9" class="empty">尚未載入任何檔案</td></tr>'}</tbody>
    <tfoot><tr><td>合計</td><td></td><td></td><td class="n">${fI(T.read)}</td><td class="n">${fI(T.kept)}</td><td class="n">${fM(T.calc)}</td>${HAS_X?`<td class="n">${fM(T.ex)}</td><td class="n">${T.miss}</td><td class="n">${fM(T.calc-T.ex)}</td>`:''}</tr></tfoot></table></div>
   ${HAS_X?'<div class="hint" style="margin-top:6px">差額 = 網頁公式合計 − Excel 直接加總。差額為正,代表 Excel 有缺公式的列而少算了;為 0 代表兩邊完全一致。</div>':''}</div>
  <div class="card" style="margin-top:14px"><div class="sech"><h2>計費規則與試算</h2><span class="hint">與 Excel「工作表2」的 N:Q 欄公式一致</span></div>
   <div class="grid g2"><div class="hint" style="font-size:13px;line-height:1.7">
    <b>單價</b>:A4 0.25、B4 0.3、其餘(含 A3)0.4 元 / 面(依「列印的紙張大小」)<br>
    <b>列印費</b> = 單價 × 列印面數<br>
    <b>裝訂費</b> = (1 針 0.25、2 針 0.5)× 份數<br>
    <b>紙張費</b> = 單價 × (列印面數 + 補計 × 係數);列印面數為 0 則 0<br>
    　補計:單面 = 0;雙面且「列印的面數(頁數)」為奇數 = 份數,偶數 = 0<br>
    　係數:頁數 = 1 或單面 = 1,其餘 0.5<br>
    <b>總費用</b> = 列印費 + 裝訂費 + 紙張費<br>
    <span class="mut">沿用過去 Excel「工作表2」的算法(紙張費按「面」計)。</span></div>
    <div><div class="calcform">
     <label>紙張<select id="tz"><option value="${A4}">A4</option><option value="${B4}">B4</option><option value="${A3}">A3</option><option value="other">其他</option></select></label>
     <label>單/雙面<select id="td"><option value="Duplex">雙面</option><option value="Simplex">單面</option></select></label>
     <label>份數<input type="number" id="th" value="30" min="0"></label>
     <label>列印面數<input type="number" id="tl" value="90" min="0"></label>
     <label>頁數(檔案)<input type="number" id="tp" value="3" min="0"></label>
     <label>裝訂<select id="tk"><option value="Off">無</option><option value="1 position">1 針</option><option value="2 positions">2 針</option></select></label></div>
     <div id="tres"></div></div></div></div>`;
}
function runCalc(){
  const g=id=>$('#'+id).value;
  const o={z:g('tz')==='other'?'other':g('tz'),d:g('td'),k:g('tk'),h:+g('th')||0,l:+g('tl')||0,p:+g('tp')||0};
  $('#tres').innerHTML=explainHtml(o);
}

/* ================= 資料視窗 ================= */
function openData(){
  const rows=[...SRC.files.values()].sort((a,b)=>(a.dmin||'').localeCompare(b.dmin||'')||a.name.localeCompare(b.name,'zh-Hant',{numeric:true}));
  const stat=n=>FILES.find(f=>f.name===n)||{kept:0};
  const rm=(k,from)=>(from==='dir'&&FS.handle)?'<span class="mut">資料夾內</span>':`<button class="lnk" data-act="delSrc" data-arg="${esc(k)}">移除</button>`;
  $('#dataBody').innerHTML=`<h2 style="margin:0 0 8px;font-size:17px">資料來源</h2>
   <div class="card" style="margin-bottom:10px">${FS.handle?`已連結資料夾:<b>${esc(FS.handle.name)}</b>(含子資料夾)。新檔案放進去後,按「↻ 重新讀取」或重新打開網頁即可。<div class="bar-row" style="margin:8px 0 0"><button class="btn" data-act="syncNow">立即重新讀取</button><button class="ghost" data-act="linkDir">改連結其他資料夾</button><button class="ghost" data-act="unlink">解除連結</button></div>`:(canFS?`尚未連結資料夾。連結後,新檔案放進「資料」資料夾就會自動加入(建議)。<div class="bar-row" style="margin:8px 0 0"><button class="btn" data-act="linkDir">連結「資料」資料夾</button></div>`:'這個瀏覽器無法自動連結資料夾(請改用 Chrome 或 Edge);目前只能手動加入檔案。')}</div>
   <div class="bar-row"><label class="hint">預設起算日 <input type="date" id="startIn" value="${esc(S.startDate)}"></label><span class="hint">開啟時預設統計自這天起;較早的資料仍保留,可在「期間」選取。</span></div>
   <div class="tw"><table><thead><tr><th>檔案</th><th>類型</th><th class="n">讀入</th><th>資料日期</th><th class="n">計入</th><th></th></tr></thead><tbody>${
    (SRC.accounts?`<tr><td>${esc(SRC.accounts.name)}</td><td>帳號列表</td><td class="n">${fI(SRC.accounts.names.length)}</td><td class="mut">—</td><td class="n mut">—</td><td>${rm('accounts',SRC.accounts.from)}</td></tr>`:'')+
    (SRC.mapping?`<tr><td>${esc(SRC.mapping.name)}</td><td>帳號對照表</td><td class="n">${fI(SRC.mapping.rows.length)}</td><td class="mut">—</td><td class="n mut">—</td><td>${rm('mapping',SRC.mapping.from)}</td></tr>`:'')+
    rows.map(f=>{const st=stat(f.name);return`<tr><td>${esc(f.name)}</td><td>影印量 · ${esc(f.sheet)}</td><td class="n">${fI(f.rows.length)}</td><td>${f.dmin?f.dmin.slice(2)+' ~ '+f.dmax.slice(5):'—'}</td><td class="n">${fI(st.kept)}</td><td>${rm('file:'+f.name,f.from)}</td></tr>`;}).join('')||(SRC.accounts||SRC.mapping?'':'<tr><td colspan="6" class="empty">尚未載入任何檔案</td></tr>')}</tbody></table></div>
   <div class="bar-row" style="margin-top:12px"><button class="btn alt" data-act="pickFiles">手動加入檔案…</button><button class="btn alt" data-act="pickDir">一次性讀取資料夾…</button><span class="sp"></span><button class="ghost" data-act="clearAll">清除全部資料</button></div>
   <div class="hint" style="line-height:1.7">• 檔案也可以直接拖進網頁(可含資料夾);同一個檔案重複加入不會重複計算。<br>• 資料存在<b>這台電腦的這個瀏覽器</b>內;換電腦時,複製整個資料夾,再「連結資料夾」即可全部讀回來。<br>• 影印機新增/刪除帳號後,重新匯出帳號列表 .csv 放進資料夾。</div>`;
  if(!$('#dataDlg').open)$('#dataDlg').showModal();
}

/* ================= 主繪製 ================= */
function render(){
  const v=$('#view');
  if(!SRC.files.size){
    $('#filters').innerHTML='';$('#tabs').innerHTML='';
    $('#stick').style.display='none';
    v.innerHTML=viewWelcome();document.title='影印紙用印量統計';return;
  }
  $('#stick').style.display='';
  refresh();
  renderFilters();
  document.title='影印紙用印量統計 · '+periodText();
  if(!R.length){v.innerHTML='<div class="empty">讀入的檔案裡沒有可統計的資料</div>';return;}
  if(!CUR.length&&S.tab!=='check'){v.innerHTML='<div class="empty">所選期間沒有資料</div>';return;}
  if(S.tab==='overview'){v.innerHTML=viewOverview();drawMonthly();}
  else if(S.tab==='classes')v.innerHTML=viewClasses();
  else if(S.tab==='users'){v.innerHTML=viewUsers();renderUsersTable();}
  else if(S.tab==='detail'){v.innerHTML=viewDetail();renderDetTable();}
  else if(S.tab==='check'){v.innerHTML=viewCheck();runCalc();}
}
function header(){
  const n=SRC.files.size;
  $('#dsub').textContent=n?`預設自 ${S.startDate.replace(/-/g,'/')} 起 ·${R.length?`資料 ${ymLabel(YM_MIN)}–${ymLabel(YM_MAX)} · ${fI(R.length)} 筆`:'尚無計入的資料'} · ${n} 個檔案${REG.size?` · 影印機帳號 ${fI(REG.size)} 個`:''}`:'尚未載入資料';
  $('#dataBtn').textContent=n?'資料 ▾':'資料';
  const t={auto:'自動',light:'淺色',dark:'深色'};
  $('#themeBtn').textContent='主題:'+t[S.theme];
  if(S.theme==='auto')delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=S.theme;
}
function go(tab){S.tab=tab;render();window.scrollTo({top:0});}
function setPreset(p){S.preset=p;if(p!=='custom')applyPreset();S.det.page=0;S.upage=1;savePrefs();render();}

/* ================= 事件 ================= */
function pickFiles(){$('#fileIn').value='';$('#fileIn').click();}
function pickDir(){$('#dirIn').value='';$('#dirIn').click();}
$('#fileIn').addEventListener('change',e=>{if(e.target.files.length)ingest(e.target.files);});
$('#dirIn').addEventListener('change',e=>{if(e.target.files.length)ingest(e.target.files);});
document.addEventListener('click',e=>{
  const op=$('details.opt');if(op&&op.open&&!op.contains(e.target))op.open=false;
  const mt=e.target.closest('[data-metric]');if(mt){S.metric=mt.dataset.metric;savePrefs();render();return;}
  const tb=e.target.closest('[data-tab]');if(tb){go(tb.dataset.tab);return;}
  if(e.target.id==='themeBtn'){S.theme=S.theme==='auto'?'light':S.theme==='light'?'dark':'auto';header();savePrefs();return;}
  if(e.target.id==='dlgClose'){$('#dlg').close();return;}
  if(e.target.id==='dataClose'){$('#dataDlg').close();return;}
  if(e.target.id==='dataBtn'){openData();return;}
  if(e.target.id==='syncBtn'){resync(true);return;}
  const a=e.target.closest('[data-act]');if(!a)return;
  if(a.tagName==='TR'&&e.target.closest('button')&&e.target.closest('button')!==a.querySelector('button.lnk'))return;
  const arg=a.dataset.arg,act=a.dataset.act,d=S.det;
  switch(act){
    case'tab':go(arg);break;
    case'pickFiles':pickFiles();break;
    case'pickDir':pickDir();break;
    case'openData':openData();break;
    case'delSrc':delSrc(arg);break;
    case'linkDir':linkDir();break;
    case'unlink':unlinkDir();break;
    case'syncNow':resync(true);break;
    case'reconnect':resync(true);break;
    case'clearAll':clearAll();break;
    case'month':{const[yy,mm]=arg.split('-').map(Number);S.preset='custom';S.from=arg+'-01';S.to=arg+'-'+pad(new Date(yy,mm,0).getDate());S.det.page=0;render();break;}
    case'goKind':S.ukind=arg;S.uq='';S.upage=1;go('users');break;
    case'goClass':S.cls=+arg;go('classes');break;
    case'selClass':S.cls=arg===''||S.cls===+arg?null:+arg;render();if(S.cls)$('#clsDetail').scrollIntoView({behavior:'smooth',block:'nearest'});break;
    case'goClassRows':S.det={...d,cls:arg,user:'',flag:'',q:'',page:0};go('detail');break;
    case'goUser':S.det={...d,user:arg,cls:'',flag:'',q:'',page:0};go('detail');break;
    case'clearUser':d.user='';d.page=0;render();break;
    case'goFlag':S.det={...d,flag:arg,user:'',cls:'',q:'',page:0};go('detail');break;
    case'resetDet':S.det={q:'',cls:'',mode:'',status:'',size:'',flag:'',user:'',sort:'t',dir:-1,page:0};render();break;
    case'sortU':if(S.usort===arg)S.udir*=-1;else{S.usort=arg;S.udir=(arg==='name'||arg==='kind')?1:-1;}renderUsersTable();break;
    case'moreU':S.upage++;renderUsersTable();break;
    case'sortD':if(d.sort===arg)d.dir*=-1;else{d.sort=arg;d.dir=(arg==='u'||arg==='m'||arg==='s'||arg==='z'||arg==='j'||arg==='cls')?1:-1;}d.page=0;renderDetTable();break;
    case'pg':d.page+=+arg;renderDetTable();$('#dtbl').scrollIntoView({block:'start'});break;
    case'explain':openExplain(+arg);break;
    case'exportClasses':exportClasses();break;
    case'exportCmp':exportCmp();break;
    case'exportUsers':exportUsers();break;
    case'exportDet':exportDet();break;
    case'exportUnreg':exportUnreg();break;
  }
});
async function delSrc(k){
  if(k==='accounts')SRC.accounts=null;else if(k==='mapping')SRC.mapping=null;else SRC.files.delete(k.slice(5));
  await kv.del(k);if(k.startsWith('file:'))delete SRC.idx[k.slice(5)];await kv.set('idx',SRC.idx);
  rebuildAll();header();render();openData();
}
async function clearAll(){
  if(!confirm('要清除這個瀏覽器內儲存的所有資料嗎?(原始檔案不會被刪除,之後可重新載入)'))return;
  for(const k of [...SRC.files.keys()])await kv.del('file:'+k);
  await kv.del('accounts');await kv.del('mapping');await kv.set('idx',{});
  SRC.files.clear();SRC.accounts=null;SRC.mapping=null;SRC.idx={};
  rebuildAll();header();render();$('#dataDlg').close();
  if(FS.handle&&await ensurePerm(false))syncDir();
}
document.addEventListener('change',e=>{
  const id=e.target.id;
  if(id==='fPreset')setPreset(e.target.value);
  else if(id==='fFrom'||id==='fTo'){const a=$('#fFrom').value,b=$('#fTo').value;if(!a||!b)return;S.preset='custom';S.from=a;S.to=b;if(a>b){if(id==='fFrom')S.to=a;else S.from=b;}S.det.page=0;render();}
  else if(id==='oMerge'){S.merge=e.target.checked;S.det.user='';S.upage=1;savePrefs();render();$('details.opt').open=true;}
  else if(id==='oJob'){S.showJob=e.target.checked;savePrefs();render();$('details.opt').open=true;}
  else if(id==='startIn'){if(/^\d{4}-\d{2}-\d{2}$/.test(e.target.value)){S.startDate=e.target.value;savePrefs();if(S.preset==='start')applyPreset();header();render();}}
  else if(id==='cSort'){S.sortCls=e.target.checked;render();}
  else if(id==='cmpGrade'){S.cmpGrade=e.target.value;render();}
  else if(id==='ukind'){S.ukind=e.target.value;S.upage=1;renderUsersTable();}
  else if(id==='uzero'){S.uzero=e.target.checked;S.upage=1;renderUsersTable();}
  else if(['dcls','dmode','dstatus','dsize','dflag'].includes(id)){const k={dcls:'cls',dmode:'mode',dstatus:'status',dsize:'size',dflag:'flag'}[id];S.det[k]=e.target.value;S.det.page=0;renderDetTable();}
  else if(id==='hiIn'){S.hi=Math.max(1,+e.target.value||500);render();}
  else if(['tz','td','th','tl','tp','tk'].includes(id))runCalc();
});
document.addEventListener('input',e=>{
  const id=e.target.id;
  if(id==='uq'){S.uq=e.target.value;S.upage=1;debounce(renderUsersTable);}
  else if(id==='dq'){S.det.q=e.target.value;S.det.page=0;debounce(renderDetTable);}
  else if(['th','tl','tp'].includes(id))runCalc();
});

let _deb;
function debounce(fn){clearTimeout(_deb);_deb=setTimeout(fn,150);}

/* 拖曳檔案 / 資料夾 */
let dragN=0;
async function entryFiles(entry,out){
  if(entry.isFile){await new Promise(r=>entry.file(f=>{out.push({file:f,path:cleanPath(entry.fullPath)});r();},()=>r()));}
  else if(entry.isDirectory){
    const rd=entry.createReader();
    for(;;){const batch=await new Promise(r=>rd.readEntries(r,()=>r([])));if(!batch.length)break;for(const en of batch)await entryFiles(en,out);}
  }
}
window.addEventListener('dragenter',e=>{if(e.dataTransfer&&[...e.dataTransfer.types].includes('Files')){dragN++;$('#overlay').style.display='flex';}});
window.addEventListener('dragleave',e=>{dragN=e.relatedTarget?Math.max(0,dragN-1):0;if(!dragN)$('#overlay').style.display='none';});
window.addEventListener('dragover',e=>{if(e.dataTransfer&&[...e.dataTransfer.types].includes('Files'))e.preventDefault();});
window.addEventListener('drop',async e=>{
  e.preventDefault();dragN=0;$('#overlay').style.display='none';
  const dt=e.dataTransfer;if(!dt)return;
  const out=[];
  if(dt.items&&dt.items.length&&dt.items[0].webkitGetAsEntry){
    const ens=[...dt.items].map(i=>i.webkitGetAsEntry&&i.webkitGetAsEntry()).filter(Boolean);
    for(const en of ens)await entryFiles(en,out);
  }else out.push(...dt.files);
  if(out.length)ingest(out);
});

/* 提示框 */
const tip=$('#tip');
let tipFor=null;
function showTip(t,x,y){
  if(tipFor!==t||tip.style.display==='none'){
  tipFor=t;
  const parts=t.dataset.tip.split('||');
  tip.textContent='';
  const b=document.createElement('b');b.textContent=parts[0];tip.appendChild(b);
  for(const p of parts.slice(1)){const s=document.createElement('span');s.textContent=p;tip.appendChild(s);tip.appendChild(document.createElement('br'));}
  }
  tip.style.display='block';
  const w=tip.offsetWidth,h=tip.offsetHeight;
  tip.style.left=Math.max(6,Math.min(innerWidth-w-6,x+12))+'px';
  tip.style.top=(y+h+20>innerHeight?y-h-10:y+16)+'px';
}
document.addEventListener('pointermove',e=>{const t=e.target.closest&&e.target.closest('[data-tip]');if(t)showTip(t,e.clientX,e.clientY);else tip.style.display='none';});
document.addEventListener('pointerleave',()=>{tip.style.display='none';});
document.addEventListener('focusin',e=>{const t=e.target.closest&&e.target.closest('[data-tip]');if(t){const r=t.getBoundingClientRect();showTip(t,r.left,r.bottom-16);}});
document.addEventListener('focusout',()=>{tip.style.display='none';});
window.addEventListener('scroll',()=>{tip.style.display='none';},{passive:true});
let lastW=innerWidth,rt;
window.addEventListener('resize',()=>{clearTimeout(rt);rt=setTimeout(()=>{if(innerWidth!==lastW){lastW=innerWidth;drawMonthly();}},120);});

/* ================= 匯出 ================= */
function exportClasses(){
  const by=group(CUR,o=>clsOf(o)||null);
  const rows=[['年級','班級','費用(元)','張數','列印面數','工作數']];
  for(const gr of GRADES)for(const c of gr.classes){const g=by.get(c)||{fee:0,sides:0,sheets:0,jobs:0};rows.push([gr.name,c,rd(g.fee),g.sheets||0,g.sides,g.jobs]);}
  download(`各班用量_${stamp()}.csv`,rows);
}
function exportCmp(){
  const{gr,M,subs}=cmpData();
  const rows=[['科目',...gr.classes,'合計']];
  for(const x of subs){const vs=gr.classes.map(c=>M.get(x.s).has(c)?rd(mv(M.get(x.s).get(c))):0);rows.push([x.s,...vs,rd(x.tot)]);}
  download(`同科比較_${gr.name}_${METRIC[S.metric]}_${stamp()}.csv`,rows);
}
function exportUsers(){
  const rows=[['帳號','類型','班級','費用(元)','張數','列印面數','工作數']];
  for(const r of userRows())rows.push([r.name,KIND[r.kind],r.cls||'',rd(r.fee),r.sheets,r.sides,r.jobs]);
  download(`使用者用量_${stamp()}.csv`,rows);
}
function exportDet(){
  const d=S.det,rows=detFilter().sort((a,b)=>cmpBy[d.sort](a,b)*d.dir);
  const head=['時間','帳號','班級','類型',...(S.showJob?['工作名稱']:[]),'狀態','紙張','單/雙','裝訂','份數','張數','列印面數','頁數','列印費','裝訂費','紙張費','總費用','Excel總費用','備註','來源檔','工作表','列號','Job ID'];
  const out=[head];
  for(const o of rows){
    const note=[o.fl&F.UNREG?'帳號未登錄':'',o.fl&F.MISS?'Excel缺公式':'',o.fl&F.DIFF?'與Excel不同':'',o.fl&F.PART?'非Done有計費':'',o.fl&F.ODD?'特殊紙張':'',o.fl&F.DUP?'疑重複':''].filter(Boolean).join(' ');
    out.push([o.t,o.u,clsOf(o)||'',o.m,...(S.showJob?[o.j]:[]),o.s,o.z,o.d,o.k,o.h,o.sp,o.l,o.p,rd(o.c[0]),rd(o.c[1]),rd(o.c[2]),rd(o.c[3]),Array.isArray(o.e)?rd(o.e[3]):'',note,FILES[o.f].name,o.sh,o.row,o.id]);
  }
  download(`明細_${stamp()}.csv`,out);
}
function exportUnreg(){
  const g=[...group(CUR.filter(o=>o.fl&F.UNREG),o=>o.u).values()].sort((a,b)=>b.fee-a.fee);
  const rows=[['帳號','班級','科目','筆數','費用(元)','說明(這欄不用填)']];
  for(const x of g){const a=acctOf(x.k);rows.push([x.k,'','',x.n,rd(x.fee),a.guess?`名稱含 ${a.guess},可能是 ${a.guess} 班`:'']);}
  download('帳號對照表.csv',rows);
  notify('已下載「帳號對照表.csv」:在「班級」欄填入班號(如 803),存檔後放進「資料」資料夾並拖進網頁,該帳號就會歸入該班。');
}

/* ================= 啟動 ================= */
window.PrintStat={ingest,syncDir,FS,state:()=>({R,FILES,REG,CUR,S,SRC}),group,fee};
(async()=>{
  await loadCache();
  rebuildAll();
  header();
  render();
  syncBtn();
  if(FS.handle){if(await ensurePerm(false))syncDir();else updateBanner();}
})();
})();
