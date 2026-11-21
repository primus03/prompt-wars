(function(){
"use strict";
var $=function(i){return document.getElementById(i)};
var mem={};
function load(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return mem[k]!==undefined?mem[k]:d}}
function save(k,v){mem[k]=v;try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]})}

/* ---------- tabs ---------- */
function tab(n){["patient","doctor"].forEach(function(x){$("v-"+x).classList.toggle("hide",x!==n);$("t-"+x).classList.toggle("on",x===n)});if(n==="doctor")renderCases()}
$("t-patient").onclick=function(){tab("patient")};$("t-doctor").onclick=function(){tab("doctor")};

/* ---------- connectivity + offline queue ---------- */
function online(){return navigator.onLine&&!$("sim").checked}
function netUI(){var o=online();$("net").textContent=o?"Online":"Offline · queuing";$("net").className="net"+(o?"":" off");if(o)flush();qinfo()}
function qinfo(){var q=load("cc_queue",[]);$("qinfo").textContent=q.length?q.length+" case(s) waiting to sync.":"Nothing waiting — all cases synced.";var c=load("cc_cases",[]).filter(function(x){return x.status!=="done"}).length;$("cnt").textContent=c?"("+c+")":""}
function flush(){var q=load("cc_queue",[]);if(!q.length)return;var cs=load("cc_cases",[]);q.forEach(function(p){cs.unshift(p)});save("cc_cases",cs);save("cc_queue",[]);qinfo();renderCases()}
window.addEventListener("online",netUI);window.addEventListener("offline",netUI);$("sim").onchange=netUI;

/* ---------- OCR ---------- */
var ocrConf=null;
function shrink(file){return new Promise(function(res){var img=new Image();img.onload=function(){var m=1600,s=Math.min(1,m/Math.max(img.width,img.height)),c=document.createElement("canvas");c.width=img.width*s;c.height=img.height*s;var x=c.getContext("2d");x.filter="grayscale(1) contrast(1.4)";x.drawImage(img,0,0,c.width,c.height);c.toBlob(function(b){res(b||file)},"image/png")};img.onerror=function(){res(file)};img.src=URL.createObjectURL(file)})}
$("file").onchange=async function(e){
  var f=e.target.files[0];if(!f)return;
  $("prev").src=URL.createObjectURL(f);$("prev").classList.remove("hide");
  $("ocrst").textContent="Reading handwriting…";
  try{
    if(!window.Tesseract)throw new Error("OCR engine not loaded");
    var blob=await shrink(f);
    var job=Tesseract.recognize(blob,"eng",{logger:function(m){if(m.status==="recognizing text")$("ocrst").textContent="Reading… "+Math.round(m.progress*100)+"%"}});
    var r=await Promise.race([job,new Promise(function(_,rej){setTimeout(function(){rej(new Error("timeout"))},60000)})]);
    $("txt").value=r.data.text.trim();ocrConf=Math.round(r.data.confidence);
    $("ocrst").textContent="Done · OCR confidence "+ocrConf+"%. Please check the text below.";
  }catch(err){ocrConf=null;$("ocrst").textContent="Automatic reading is unavailable here ("+err.message+"). Type or paste the prescription text below — verification still works."}
};

/* ---------- verification engine ---------- */
function parse(t){
  var o={vit:{},meds:[],flags:[]},m;
  m=t.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);if(m)o.vit.bp=[+m[1],+m[2]];
  m=t.match(/(?:pulse|hr|heart\s*rate)\s*[:\-]?\s*(\d{2,3})/i);if(m)o.vit.hr=+m[1];
  m=t.match(/temp(?:erature)?\s*[:\-]?\s*(\d{2,3}(?:\.\d)?)\s*°?\s*([FC])?/i);if(m){var v=+m[1],u=(m[2]||(v>45?"F":"C")).toUpperCase();o.vit.temp=[v,u]}
  m=t.match(/(?:spo2|spo₂|oxygen|sat)\s*[:\-]?\s*(\d{2,3})/i);if(m)o.vit.spo2=+m[1];
  m=t.match(/(?:wt|weight)\s*[:\-]?\s*(\d{2,3}(?:\.\d)?)/i);if(m)o.vit.wt=+m[1];
  t.split(/\n/).forEach(function(l){if(/^\s*(tab|cap|syp|inj|oint|drops?)\b/i.test(l))o.meds.push(l.trim())});
  o.date=(t.match(/\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\b/)||[])[1];
  o.doctor=(t.match(/\bDr\.?\s+[A-Z][A-Za-z. ]{2,30}/)||[])[0];
  o.reg=(t.match(/reg(?:istration)?\.?\s*(?:no\.?)?\s*[:\-]?\s*([A-Z0-9\/\-]{4,})/i)||[])[1];
  return o;
}
function check(o,conf){
  var f=o.flags,v=o.vit;
  function add(sev,msg){f.push({s:sev,m:msg})}
  if(conf!=null&&conf<70)add("warn","Low OCR confidence ("+conf+"%) — doctor must review the original image.");
  if(!o.doctor)add("warn","Prescriber name missing.");
  if(!o.reg)add("bad","Doctor registration number missing — record cannot be verified as genuine.");
  if(!o.date)add("warn","Prescription date missing.");
  if(!o.meds.length)add("warn","No medicines detected.");
  if(!Object.keys(v).length)add("warn","No vitals found in the record.");
  if(v.bp&&(v.bp[0]<60||v.bp[0]>260||v.bp[1]<30||v.bp[1]>150||v.bp[1]>=v.bp[0]))add("bad","Blood pressure "+v.bp.join("/")+" looks implausible — possible misread or fake entry.");
  if(v.hr&&(v.hr<30||v.hr>220))add("bad","Pulse "+v.hr+" is outside the possible range.");
  if(v.spo2&&(v.spo2>100||v.spo2<50))add("bad","SpO₂ "+v.spo2+"% is not possible.");
  if(v.temp){var c=v.temp[1]==="F"?(v.temp[0]-32)*5/9:v.temp[0];if(c<32||c>43)add("bad","Temperature value is implausible.")}
  var seen={};o.meds.forEach(function(l){var n=(l.replace(/^\w+\.?\s*/,"").match(/[A-Za-z]{4,}/)||[""])[0].toLowerCase();if(n&&seen[n])add("warn","Duplicate medicine: "+n);seen[n]=1});
  return o;
}
function triage(o,voice){
  var v=o.vit,u=false,r=false;
  if(v.spo2&&v.spo2<90)u=true;if(v.bp&&(v.bp[0]>=180||v.bp[1]>=120||v.bp[0]<90))u=true;
  if(v.temp){var c=v.temp[1]==="F"?(v.temp[0]-32)*5/9:v.temp[0];if(c>=39.5)u=true;else if(c>=38)r=true}
  if(v.hr&&(v.hr>130||v.hr<45))u=true;
  if(/chest pain|breath|unconscious|bleeding|सीने में दर्द|सांस|बेहोश|खून/i.test(voice||""))u=true;
  if(o.flags.some(function(x){return x.s==="bad"}))r=true;
  if(v.bp&&(v.bp[0]>=140||v.bp[1]>=90))r=true;
  return u?"urgent":r||o.flags.length?"review":"routine";
}
var last=null;
function verify(){
  var t=$("txt").value.trim(),vo=$("voice").value.trim();
  if(!t&&!vo){alert("Add prescription text, a scan, or a voice note first.");return}
  var o=check(parse(t),ocrConf);o.level=triage(o,vo);last=o;
  var v=o.vit,h="<h2>4 · Verification result</h2><span class='chip "+(o.level==="urgent"?"bad":o.level==="review"?"warn":"ok")+"'>"+o.level.toUpperCase()+"</span>";
  h+="<div class='vit'>"+vitCell("BP",v.bp?v.bp.join("/"):"–")+vitCell("Pulse",v.hr||"–")+vitCell("Temp",v.temp?v.temp[0]+"°"+v.temp[1]:"–")+vitCell("SpO₂",v.spo2?v.spo2+"%":"–")+vitCell("Weight",v.wt?v.wt+" kg":"–")+"</div>";
  h+=o.flags.length?"<ul>"+o.flags.map(function(x){return"<li><span class='chip "+x.s+"'>"+(x.s==="bad"?"Fake/invalid?":"Check")+"</span>"+esc(x.m)+"</li>"}).join("")+"</ul>":"<p class='chip ok'>No problems detected</p>";
  h+="<button class='btn' id='send'>Send to doctor</button><div id='sendinfo' class='muted'></div>";
  $("result").innerHTML=h;$("result").classList.remove("hide");$("send").onclick=send;$("result").scrollIntoView({behavior:"smooth"});
}
function vitCell(a,b){return"<div><b>"+esc(b)+"</b><span>"+a+"</span></div>"}
$("verify").onclick=verify;

/* ---------- compact payload (target < 10 KB) ---------- */
async function pack(p){
  var json=JSON.stringify(p),bytes=new TextEncoder().encode(json),size=bytes.length;
  try{if(window.CompressionStream){var cs=new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));size=(await new Response(cs).arrayBuffer()).byteLength}}catch(e){}
  return{raw:bytes.length,gz:size};
}
async function send(){
  if(!last)return;
  var id="CC"+Date.now().toString(36).toUpperCase();
  var p={id:id,ts:Date.now(),name:$("pn").value||"Unknown",age:$("pa").value,village:$("pv").value,phone:$("pp").value,vit:last.vit,meds:last.meds.slice(0,12),flags:last.flags,doctor:last.doctor||"",reg:last.reg||"",date:last.date||"",level:last.level,voice:$("voice").value.trim().slice(0,1200),lang:$("lang").value,conf:ocrConf,status:"new"};
  var s=await pack(p);
  if(s.gz>10240){p.voice=p.voice.slice(0,400);s=await pack(p)}
  p.size=s.gz;
  if(online()){var cs=load("cc_cases",[]);cs.unshift(p);save("cc_cases",cs);$("sendinfo").textContent="Sent ✓ Payload "+(s.gz/1024).toFixed(1)+" KB (compressed) — limit 10 KB."}
  else{var q=load("cc_queue",[]);q.push(p);save("cc_queue",q);$("sendinfo").textContent="No signal — saved on this device and will sync automatically. Payload "+(s.gz/1024).toFixed(1)+" KB."}
  qinfo();
}

/* ---------- voice (Web Speech API) ---------- */
var rec=null,on=false;
$("mic").onclick=function(){
  var SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){$("micst").textContent="Voice capture isn’t supported in this browser — please type the symptoms.";return}
  if(on){rec.stop();return}
  rec=new SR();rec.lang=$("lang").value;rec.interimResults=true;rec.continuous=true;var base=$("voice").value?$("voice").value+" ":"";
  rec.onresult=function(e){var s="";for(var i=0;i<e.results.length;i++)s+=e.results[i][0].transcript;$("voice").value=base+s};
  rec.onstart=function(){on=true;$("mic").textContent="⏹ Stop";$("micst").textContent="Listening…"};
  rec.onend=function(){on=false;$("mic").textContent="🎤 Start speaking";$("micst").textContent=""};
  rec.onerror=function(e){$("micst").textContent="Mic error: "+e.error+". You can type instead."};
  rec.start();
};

/* ---------- doctor portal ---------- */
function renderCases(){
  var cs=load("cc_cases",[]),rank={urgent:0,review:1,routine:2};
  cs.sort(function(a,b){return(a.status==="done")-(b.status==="done")||rank[a.level]-rank[b.level]||b.ts-a.ts});
  if(!cs.length){$("cases").innerHTML="<div class='card muted'>No cases yet. Send one from the Patient tab.</div>";qinfo();return}
  $("cases").innerHTML=cs.map(function(c,i){
    var v=c.vit||{};
    return"<div class='card case "+c.level+"'><b>"+esc(c.name)+"</b> <span class='muted'>"+esc(c.age?c.age+" yrs":"")+" "+esc(c.village)+" · "+new Date(c.ts).toLocaleString()+"</span><br>"
    +"<span class='chip "+(c.level==="urgent"?"bad":c.level==="review"?"warn":"ok")+"'>"+c.level.toUpperCase()+"</span>"+(c.status==="done"?"<span class='chip ok'>Reviewed</span>":"")
    +"<div class='vit'>"+vitCell("BP",v.bp?v.bp.join("/"):"–")+vitCell("Pulse",v.hr||"–")+vitCell("Temp",v.temp?v.temp[0]+"°"+v.temp[1]:"–")+vitCell("SpO₂",v.spo2?v.spo2+"%":"–")+"</div>"
    +(c.flags&&c.flags.length?"<ul>"+c.flags.map(function(x){return"<li>"+esc(x.m)+"</li>"}).join("")+"</ul>":"")
    +(c.meds&&c.meds.length?"<div class='muted'>Medicines</div><ul>"+c.meds.map(function(m){return"<li>"+esc(m)+"</li>"}).join("")+"</ul>":"")
    +(c.voice?"<div class='muted'>Patient said</div><div>“"+esc(c.voice)+"”</div>":"")
    +"<label>Doctor’s advice</label><textarea data-i='"+esc(c.id)+"' class='adv'>"+esc(c.advice||"")+"</textarea>"
    +"<div class='btns'><button class='btn' data-done='"+esc(c.id)+"'>Mark reviewed</button>"+(c.phone?"<a class='btn sec' style='text-decoration:none' target='_blank' rel='noopener' href='https://wa.me/"+encodeURIComponent(c.phone.replace(/\D/g,""))+"?text="+encodeURIComponent("CareConnect advice for "+c.name+": "+(c.advice||""))+"'>Send via WhatsApp</a>":"")+"<span class='muted'>"+(c.size?(c.size/1024).toFixed(1)+" KB payload":"")+"</span></div></div>";
  }).join("");
  Array.prototype.forEach.call(document.querySelectorAll("[data-done]"),function(b){b.onclick=function(){var id=b.getAttribute("data-done"),all=load("cc_cases",[]),ta=document.querySelector("textarea[data-i='"+id+"']");all.forEach(function(c){if(c.id===id){c.status="done";c.advice=ta.value}});save("cc_cases",all);renderCases()}});
  Array.prototype.forEach.call(document.querySelectorAll(".adv"),function(t){t.onchange=function(){var id=t.getAttribute("data-i"),all=load("cc_cases",[]);all.forEach(function(c){if(c.id===id)c.advice=t.value});save("cc_cases",all)}});
  qinfo();
}

$("sample").onclick=function(){$("txt").value="Dr. A. Sharma   Reg. No: UP-48213\nDate: 18/11/2026\nBP 150/95  Pulse 98  Temp 101.2 F  SpO2 95  Wt 62\nTab Paracetamol 500mg 1-0-1 x 3 days\nSyp Cough Relief 5ml TDS\nTab Paracetamol 650mg SOS";$("voice").value="Do din se bukhar aur khansi hai, sar dard bhi hai.";ocrConf=null};

netUI();renderCases();
})();
