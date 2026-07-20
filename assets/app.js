(function(){
"use strict";
var D = window.VOC_DATA;
var $ = function(s,r){return (r||document).querySelector(s);};
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c];});}
function fmtDate(iso){var m=["January","February","March","April","May","June","July","August","September","October","November","December"];var p=iso.split("-");return m[+p[1]-1]+" "+(+p[2])+", "+p[0];}
// Return a clean "n similar" count, or null if the value is a duration/amount/desc (not a similar-count)
function similarCount(c){
  if(!c) return null;
  var s=String(c).trim();
  if(/[$%]|hour|hr\b|week|wk\b|\bday|month|\bmo\b|\/mo|entit|half|fail|theme|min\b|pts|:|→|\bpt\b/i.test(s)) return null;
  var m=s.match(/^(\d+)(\+)?/);
  return m? m[1]+(m[2]||"") : null;
}

var LANES = {top100:["Gong","ECE"], customer:["ECE","Gong"], field:["Heartbeat","Time in Motion","Roundtable","derived/analysis"]};
var SENT_ORDER = {red:0,amber:1,green:2,neutral:3};

var state = {lane:"all", segment:"", product:"", source:"", theme:"", sentiment:"", q:""};
var frictionFilter = {critical:true, high:true, medium:true};
var firmFilter = "all";
var v2cut = "Combined"; // Top 100 product view: Combined / IES / IAS
var dataLens = "loss"; // Customer views data lens: loss (closed-lost Gong) / ece (ECE AI-demand) / both
function fmtM(n){n=+n||0; if(n>=1e6){var m=(n/1e6); return (m>=10?m.toFixed(1):m.toFixed(2)).replace(/\.?0+$/,'')+"M";} if(n>=1e3) return Math.round(n/1e3)+"K"; return String(Math.round(n));}
function cleanFirm(n){var m=String(n).split(",")[0].replace(/\s+\d+\b.*$/,"").replace(/\s+-\s+.*$/,"").trim(); return m||n;}

/* ---------- header ---------- */
$("#updated").textContent = "Updated "+fmtDate(D.meta.updated);
$("#scope").textContent = (D.meta.confidential?"Confidential · ":"")+D.meta.scope;
$("#foot").innerHTML = "Intuit Commercial Sales · Voice of Customer / Voice of Field · "+D.meta.n_signals+" classified signals · source pipeline health on the Sources tab · Confidential — for internal use only.";

/* ---------- filters ---------- */
function opt(v,label){return '<option value="'+esc(v)+'">'+esc(label)+'</option>';}
function fillSelect(id, items, allLabel){
  var s=$(id), html=opt("",allLabel);
  items.forEach(function(it){
    if(typeof it==="string") html+=opt(it,it);
    else html+=opt(it.k, it.k+(it.data?"":" — no data yet"));
  });
  s.innerHTML=html;
}
fillSelect("#f-segment", D.filters.segment, "All segments");
fillSelect("#f-product", D.filters.product, "All products");
fillSelect("#f-source", D.filters.source.map(function(s){return s==="derived/analysis"?"Analysis":s;}), "All sources");
fillSelect("#f-theme", D.filters.theme, "All themes");
fillSelect("#f-sentiment", [{k:"red",data:1},{k:"amber",data:1},{k:"green",data:1},{k:"neutral",data:1}].map(function(x){return x.k;}), "All sentiment");
// relabel sentiment options
(function(){var s=$("#f-sentiment");var L={red:"Alert (red)",amber:"Caution (amber)",green:"Positive (green)",neutral:"Neutral"};Array.prototype.slice.call(s.options).forEach(function(o){if(L[o.value])o.textContent=L[o.value];});})();

function bind(id,key){$(id).addEventListener("change",function(){state[key]=this.value;render();scrollResults();});}
bind("#f-segment","segment");bind("#f-product","product");bind("#f-theme","theme");bind("#f-sentiment","sentiment");
$("#f-source").addEventListener("change",function(){state.source=this.value==="Analysis"?"derived/analysis":this.value;render();scrollResults();});
$("#f-search").addEventListener("input",function(){state.q=this.value.trim().toLowerCase();render();});
$("#reset").addEventListener("click",function(){
  state.segment=state.product=state.source=state.theme=state.sentiment=state.q="";
  ["#f-segment","#f-product","#f-source","#f-theme","#f-sentiment"].forEach(function(i){$(i).value="";});
  $("#f-search").value="";render();
});

/* ---------- tabs ---------- */
var VALID_LANES=["all","top100","customer","field","sources","partners","investors"];
function selectLane(lane){
  if(VALID_LANES.indexOf(lane)<0) lane="all";
  document.querySelectorAll(".tab").forEach(function(x){x.setAttribute("aria-selected", x.dataset.lane===lane?"true":"false");});
  state.lane=lane;
}
Array.prototype.slice.call(document.querySelectorAll(".tab")).forEach(function(t){
  t.addEventListener("click",function(){selectLane(t.dataset.lane);if(location.hash!=="#"+t.dataset.lane)location.hash=t.dataset.lane;render();});
});
window.addEventListener("hashchange",function(){selectLane((location.hash||"").replace("#",""));render();});

/* ---------- Top 100 product toggle (Combined / IES / IAS) ---------- */
Array.prototype.slice.call(document.querySelectorAll(".cuttog")).forEach(function(b){
  b.addEventListener("click",function(){v2cut=b.dataset.cut;render();var v=$("#gapsSection");if(v)window.scrollTo({top:v.getBoundingClientRect().top+window.pageYOffset-120,behavior:"smooth"});});
});
function renderCutbar(){
  Array.prototype.slice.call(document.querySelectorAll(".cuttog")).forEach(function(b){b.classList.toggle("on",b.dataset.cut===v2cut);});
  var c=D.v2.cuts[v2cut];
  $("#cutmeta").innerHTML=c.calls.toLocaleString()+" calls · "+c.firms+" firms · "+c.deals+" lost deals · $"+fmtM(c.dollars)+" closed-lost";
}

/* ---------- Data lens (Closed-lost / ECE AI-demand / Both) ---------- */
Array.prototype.slice.call(document.querySelectorAll(".lenstog")).forEach(function(b){
  b.addEventListener("click",function(){dataLens=b.dataset.lens;render();});
});
function renderEcePanel(){
  var box=$("#ecePanel"); if(!box) return;
  if(dataLens==="loss"){box.innerHTML="";return;}
  var E=D.eceWave2, SIG={critical:"Critical",high:"High",medium:"Medium"};
  // headline
  var head='<div class="section-tag">ECE — Agent Studio / AI demand · '+esc(E.meta.window)+'</div>'+
    '<div class="card ecehead"><div class="ecebig">21<span>/21 firms</span></div>'+
    '<div class="ecehead-t"><h2 class="h">'+esc(E.meta.headline)+'</h2>'+
    '<p class="h-sub">'+E.meta.calls+' executive engagements · '+E.meta.firms+' firms · '+esc(E.meta.note)+'</p></div></div>';
  // watchlist
  var wl=E.watchlist.map(function(r){
    var sent=r.sentiment==="positive"?"green":r.sentiment==="negative"?"red":"neutral";
    return '<tr class="frow"><td><div class="fwfirm">'+esc(r.firm)+'</div><div class="fwsub">'+esc(r.product)+'</div></td>'+
      '<td><span class="sigbadge '+r.signal+'">'+SIG[r.signal]+'</span></td>'+
      '<td class="num">'+r.calls+'</td><td class="fwissue">'+esc(r.concern)+'</td>'+
      '<td><span class="tag '+sent+'">'+esc(r.sentiment)+'</span></td></tr>';
  }).join("");
  var watch='<div class="section-tag">ECE firm watchlist ('+E.watchlist.length+' firms)</div>'+
    '<div class="card"><div class="chart-head"><div><h2 class="h">Every firm is pulling on Agent Studio</h2>'+
    '<p class="h-sub">Highest signal per firm · leading concern beyond the AI demand · demo & relationship calls</p></div></div>'+
    '<div class="tablewrap"><table class="ftable"><thead><tr><th>Firm</th><th>Signal</th><th class="num">Calls</th><th>Leading concern</th><th>Sentiment</th></tr></thead><tbody>'+wl+'</tbody></table></div>'+
    '<div class="fnote">Signal = how forcefully AI/readiness came up. These are exec/demo calls — no closed-lost $. Two Critical: BDO (Intuit competing via QuickBooks Live) and Forvis (“not ready for prime time”).</div></div>';
  // friction themes by firms
  var fr=E.friction.filter(function(t){return t.kind==="friction";});
  var fmax=Math.max.apply(null,fr.map(function(t){return t.firms;}))||1;
  var frows=fr.map(function(t,i){
    return '<div class="trank"><div class="rk">'+(i+1)+'</div><div class="tt">'+esc(t.theme)+(t.isNew?' <span class="newtag">NEW</span>':'')+'</div>'+
      '<div class="meter"><i class="fill-brand" style="width:'+(100*t.firms/fmax)+'%"></i></div>'+
      '<div class="vv num">'+t.firms+' firms</div></div>';
  }).join("");
  var friction='<div class="section-tag">What’s gating the demand — friction themes by firms</div>'+
    '<div class="card"><p class="h-sub" style="margin:0 0 8px">Distinct firms (of '+E.meta.firms+') that raised each · Agent Studio demand itself is universal (21/21)</p>'+frows+'</div>';
  // competitors
  var crows=E.competitors.map(function(x){
    var flag=x.type==="AI-automation"?' <span class="whale">watch</span>':(x.type==="Intuit’s own"?' <span class="cosellflag">internal</span>':'');
    return '<tr><td><div class="fwfirm">'+esc(x.name)+flag+'</div><div class="fwsub">'+esc(x.type)+'</div></td>'+
      '<td class="num">'+x.calls+'</td><td class="num">'+x.firms+'</td><td class="fwissue">'+esc(x.note)+'</td></tr>';
  }).join("");
  var comps='<div class="section-tag">Who we lose to — competitors named</div>'+
    '<div class="card"><div class="tablewrap"><table class="ftable"><thead><tr><th>Competitor</th><th class="num">Calls</th><th class="num">Firms</th><th>Context</th></tr></thead><tbody>'+crows+'</tbody></table></div>'+
    '<div class="fnote"><b>No competitor is tied to a stated closed-lost deal in this wave</b> (these are demo calls). BASIS is the one to watch — named in 16 calls, and Eisner + Anders have committed to it over Intuit’s AI.</div></div>';
  // capability + migration (two cards)
  var capmax=Math.max.apply(null,E.capability.map(function(r){return r.calls;}))||1;
  var caprows=E.capability.map(function(r,i){
    return '<div class="trank"><div class="rk">'+(i+1)+'</div><div class="tt">'+esc(r.ask)+'</div>'+
      '<div class="meter"><i class="fill-brand" style="width:'+(100*r.calls/capmax)+'%"></i></div>'+
      '<div class="vv num">'+r.calls+' · '+r.pct+'%</div></div>';
  }).join("");
  var migmax=Math.max.apply(null,E.migration.map(function(r){return r.calls;}))||1;
  var migrows=E.migration.map(function(r,i){
    return '<div class="trank"><div class="rk">'+(i+1)+'</div><div class="tt">'+esc(r.path)+'</div>'+
      '<div class="meter"><i class="fill-brand" style="width:'+(100*r.calls/migmax)+'%"></i></div>'+
      '<div class="vv num">'+r.calls+' · '+r.pct+'%</div></div>';
  }).join("");
  var twoup='<div class="section-tag">What customers ask AI to do &middot; how they migrate</div>'+
    '<div class="grid-2"><div class="card"><h2 class="h" style="font-size:.95rem">What customers ask AI/Agent Studio to do</h2>'+
    '<p class="h-sub">ECE · capability demand · % of '+E.meta.substantive+' substantive calls</p><div style="margin-top:8px">'+caprows+'</div></div>'+
    '<div class="card"><h2 class="h" style="font-size:.95rem">Migration paths mentioned</h2>'+
    '<p class="h-sub">ECE · % of '+E.meta.substantive+' calls · thin by nature (demo calls)</p><div style="margin-top:8px">'+migrows+'</div></div></div>';
  box.innerHTML=head+watch+friction+comps+twoup;
}
function kpisTop100(){
  var c=D.v2.cuts[v2cut], cov=c.deals?Math.round(100*c.dollars_cov/c.deals):0, d0=c.churn[0];
  return [
   {sentiment:"neutral",seg:"Top 100 · "+v2cut,label:"Calls analyzed",value:c.calls.toLocaleString(),sub:c.firms+" firms"+(v2cut==="Combined"?" · 105 of 207 · V2 delivered":"")},
   {sentiment:"neutral",seg:"Pipeline",label:"Closed-lost deals",value:String(c.deals),sub:"rolling 12-mo window"},
   {sentiment:"amber",seg:"Closed-lost $",label:"Pipeline in view",value:"$"+fmtM(c.dollars),sub:"Salesforce · ~"+cov+"% coverage — a floor"},
   {sentiment:"red",seg:"#1 driver",label:d0[0],value:d0[2]+"%",sub:d0[1]+" calls"},
   {sentiment:"neutral",seg:"Co-sell",label:"Calls that are co-sell",value:c.cosell_pct+"%",sub:c.cosell+" calls · not firms' own deals"}
  ];
}
function renderIesVsIas(){
  var box=$("#iesVsIas");
  if(v2cut!=="Combined"){box.innerHTML="";return;}
  var IV=D.iesVsIas;
  var cols=IV.rows.map(function(r){
    return '<div class="ivcol '+r.color+'"><div class="ivside">'+esc(r.side)+'</div><div class="ivlabel">'+esc(r.label)+'</div><ul>'+r.points.map(function(p){return '<li>'+esc(p)+'</li>';}).join("")+'</ul></div>';
  }).join("");
  box.innerHTML='<div class="section-tag">'+esc(IV.title)+'</div><div class="card"><p class="h-sub" style="margin:0 0 12px">'+esc(IV.sub)+'</p><div class="ivgrid">'+cols+'</div></div>';
}
function renderCompetitors(){
  var C=D.v2.competitors; if(!C){return;}
  var key=v2cut==="IES"?"ies":v2cut==="IAS"?"ias":null;
  var list=C.filter(function(x){return key?(x[key+"_calls"]>0||x[key+"_dollars"]>0):(x.calls>0);})
            .sort(function(a,b){return (key?b[key+"_dollars"]:b.dollars)-(key?a[key+"_dollars"]:a.dollars);}).slice(0,12);
  var rows=list.map(function(x){
    var calls=key?x[key+"_calls"]:x.calls, dol=key?x[key+"_dollars"]:x.dollars;
    var whale=x.deals<=2 && x.dollars>=500000;
    return '<tr><td><div class="fwfirm">'+esc(x.name)+(whale?' <span class="whale">whale · '+x.deals+' deal'+(x.deals===1?'':'s')+'</span>':'')+'</div><div class="fwsub">'+esc(x.seg)+'</div></td>'+
      '<td class="num">'+calls+'</td><td class="num">'+x.firms+'</td><td class="num">'+x.deals+'</td><td class="num">$'+fmtM(dol)+'</td></tr>';
  }).join("");
  $("#competitors").innerHTML=
   '<div class="chart-head"><div><h2 class="h">Who we lose to — '+v2cut+'</h2><p class="h-sub">Closed-lost deals that named each competitor</p></div></div>'+
   '<div class="tablewrap"><table class="ftable"><thead><tr><th>Competitor</th><th class="num">Calls</th><th class="num">Firms</th><th class="num">Deals</th><th class="num">$ lost</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
   '<div class="topfix">'+esc(D.netsuiteWhale)+'</div>'+
   '<div class="fnote">$ = Salesforce closed-lost (linked) on deals naming the competitor. A deal can name more than one, so these are <b>not additive</b>; some are single whale deals (Sage 300 = one deal). Always read $ next to deal count.</div>';
}

/* ---------- Scorecard (program rollup) ---------- */
function renderScorecard(){
  var S=D.scorecard; if(!S){return;}
  $("#scorecard").innerHTML=S.tiles.map(function(t){
    return '<div class="sctile '+t.s+'">'+
      '<div class="sctop"><span class="scdomain">'+esc(t.domain)+'</span><span class="scstatus '+t.s+'">'+esc(t.status)+'</span></div>'+
      '<div class="scmetric num">'+esc(t.metric)+(t.unit?' <small>'+esc(t.unit)+'</small>':'')+'</div>'+
      '<div class="sclabel">'+esc(t.label)+'</div>'+
      '<div class="scsub">'+esc(t.sub)+'</div></div>';
  }).join("");
}

/* ---------- KPI ---------- */
var BASELINE = D.signals.filter(function(s){return !s.commentary;}).length;
function mode(arr){var m={},best="—",bc=0;arr.forEach(function(x){if(!x)return;m[x]=(m[x]||0)+1;if(m[x]>bc){bc=m[x];best=x;}});return {key:best,count:bc};}
// Top 100 / Customer lanes: deck-accurate program metrics (SLRN-425)
var KPIS_TOP100=[
 {sentiment:"neutral",seg:"Top 100 · Gong",label:"Calls analyzed",value:"1,243",sub:"60 of 77 T100 firms · V1 directional read"},
 {sentiment:"neutral",seg:"Firm-level read",label:"Diamond firms · 10+ calls",value:"7 of 9",sub:"where the firm-level read lives"},
 {sentiment:"amber",seg:"Top 100 · losses",label:"Explained by 3 gaps",value:"82%",sub:"escalations · demo fit · pricing (below)"},
 {sentiment:"neutral",seg:"Top 100 · pipeline",label:"Closed-lost opps",value:"278",sub:"in the rolling 12-mo window"}
];
function kpiTile(k){return '<div class="kpi '+k.sentiment+'"><div class="seg">'+esc(k.seg)+'</div><div class="lab">'+esc(k.label)+'</div><div class="v num">'+esc(k.value)+'</div><div class="sub">'+esc(k.sub)+'</div></div>';}
function kpisEce(){
  var E=D.eceWave2, top=E.capability[0], comp=E.competitors[0];
  return [
   {sentiment:"neutral",seg:"ECE · May–Jul 2026",label:"Exec engagements",value:String(E.meta.calls),sub:E.meta.firms+" firms · demo & relationship calls"},
   {sentiment:"green",seg:"Demand",label:"Agent Studio / AI",value:"21/21",sub:"firms · universal demand"},
   {sentiment:"red",seg:"Competitor to watch",label:comp.name,value:comp.calls+" calls",sub:comp.firms+" firms · Eisner + Anders committed"},
   {sentiment:"amber",seg:"Top ask",label:top.ask,value:top.pct+"%",sub:top.calls+" of "+E.meta.substantive+" calls"},
   {sentiment:"red",seg:"Critical signal",label:"Firms flagged",value:"2",sub:"Forvis (not ready) · BDO (Intuit competing)"}
  ];
}
function renderKPIs(F){
  if(state.lane==="top100"||state.lane==="customer"){$("#kpis").innerHTML=(dataLens==="ece"?kpisEce():kpisTop100()).map(kpiTile).join("");return;}
  var red=0,green=0,amber=0;
  F.forEach(function(s){if(s.sentiment==="red")red++;else if(s.sentiment==="green")green++;else if(s.sentiment==="amber")amber++;});
  var n=F.length||1, SRCL={"derived/analysis":"Analysis"};
  var th=mode(F.map(function(s){return s.theme;})), sr=mode(F.map(function(s){return s.src;}));
  var tiles=[
   {sentiment:"neutral",seg:"In view",label:"Signals matching",value:String(F.length),sub:"of "+BASELINE+" classified"},
   {sentiment:"red",seg:"Needs attention",label:"Alerts",value:String(red),sub:Math.round(100*red/n)+"% of this view"},
   {sentiment:"amber",seg:"Most-cited theme",label:(th.key||"—"),value:String(th.count||0),sub:"signals on this theme"},
   {sentiment:"neutral",seg:"Largest source",label:(SRCL[sr.key]||sr.key||"—"),value:String(sr.count||0),sub:"signals from this source"},
   {sentiment:"green",seg:"Positive",label:"Green signals",value:String(green),sub:Math.round(100*green/n)+"% of this view"}
  ];
  $("#kpis").innerHTML = tiles.map(kpiTile).join("");
}

/* ---------- time series (SVG) ---------- */
function renderTimeseries(){
  var t=D.timeseries, W=600,H=250, padL=44,padR=18,padT=24,padB=34;
  var labels=t.labels, n=labels.length;
  var all=[]; t.series.forEach(function(s){all=all.concat(s.values);});
  var max=Math.ceil(Math.max.apply(null,all)/10)*10, min=0;
  function x(i){return padL+(W-padL-padR)*(n===1?0.5:i/(n-1));}
  function y(v){return padT+(H-padT-padB)*(1-(v-min)/(max-min));}
  var CMAP={brand:"var(--brand)",red:"var(--red)",amber:"var(--amber)",green:"var(--green)"};
  var svg='<svg viewBox="0 0 '+W+' '+H+'" width="100%" role="img" aria-label="time series">';
  // NOW band on last point
  svg+='<rect x="'+(x(n-1)-26)+'" y="'+padT+'" width="52" height="'+(H-padT-padB)+'" fill="var(--brand-tint)" opacity=".5"/>';
  svg+='<text x="'+x(n-1)+'" y="'+(padT-8)+'" text-anchor="middle" class="now-flag" fill="var(--brand)" font-size="10" font-weight="800">NOW</text>';
  // gridlines
  for(var g=0;g<=max;g+=10){svg+='<line x1="'+padL+'" y1="'+y(g)+'" x2="'+(W-padR)+'" y2="'+y(g)+'" stroke="var(--line)"/>'+
    '<text x="'+(padL-8)+'" y="'+(y(g)+3)+'" text-anchor="end" font-size="9" fill="var(--muted)">'+g+'%</text>';}
  // x labels
  labels.forEach(function(l,i){svg+='<text x="'+x(i)+'" y="'+(H-padB+18)+'" text-anchor="middle" font-size="10" fill="var(--ink-soft)" font-weight="600">'+esc(l)+'</text>';});
  // lines + points
  t.series.forEach(function(s){
    var col=CMAP[s.color]||"var(--brand)";
    var d=s.values.map(function(v,i){return (i?"L":"M")+x(i)+" "+y(v);}).join(" ");
    svg+='<path d="'+d+'" fill="none" stroke="'+col+'" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
    s.values.forEach(function(v,i){
      svg+='<circle cx="'+x(i)+'" cy="'+y(v)+'" r="4" fill="#fff" stroke="'+col+'" stroke-width="2.5"/>';
      svg+='<text x="'+x(i)+'" y="'+(y(v)-10)+'" text-anchor="middle" font-size="10" font-weight="800" fill="'+col+'">'+v+'%</text>';
    });
  });
  svg+='</svg>';
  var legend=t.series.map(function(s){return '<span><i class="swatch-'+s.color+'"></i>'+esc(s.name)+'</span>';}).join("");
  $("#timeseries").innerHTML='<div class="chart-head"><div><h2 class="h">'+esc(t.title)+'</h2><p class="h-sub">'+esc(t.sub)+'</p></div></div>'+
    svg+'<div class="legend">'+legend+'</div><p class="card-note">'+esc(t.note)+'</p>'+(t.fix?'<div class="topfix">'+esc(t.fix)+'</div>':'');
}

/* ---------- word cloud (reactive to filters) ---------- */
function renderWordcloud(filtered){
  var pairs=D.wordcloud.map(function(w){
    var tl=w[0].toLowerCase();
    var c=filtered.reduce(function(a,s){return a+(((s.text+" "+s.theme).toLowerCase().indexOf(tl)>=0)?1:0);},0);
    return [w[0],c];
  }).filter(function(p){return p[1]>0;}).sort(function(a,b){return b[1]-a[1];});
  var head='<div class="chart-head"><div><h2 class="h">What\'s driving the volume</h2><p class="h-sub">Term frequency in the filtered signals · click to filter</p></div></div>';
  if(!pairs.length){$("#wordcloud").innerHTML=head+'<div class="cloud"><span style="color:var(--muted)">No terms in this slice — loosen a filter.</span></div>';return;}
  var max=pairs[0][1],min=pairs[pairs.length-1][1],span=(max===min)?1:(max-min);
  var html=pairs.map(function(w){
    var f=(w[1]-min)/span;
    return '<button data-term="'+esc(w[0])+'" title="'+w[1]+' signals" style="font-size:'+(0.85+1.7*f).toFixed(2)+'rem;opacity:'+(0.6+0.4*f).toFixed(2)+'">'+esc(w[0])+'</button>';
  }).join("");
  $("#wordcloud").innerHTML=head+'<div class="cloud">'+html+'</div>';
  Array.prototype.slice.call(document.querySelectorAll(".cloud button")).forEach(function(b){
    b.addEventListener("click",function(){state.q=b.dataset.term.toLowerCase();$("#f-search").value=b.dataset.term;render();scrollResults();});
  });
}

/* ---------- stacked mix ---------- */
function renderMix(){
  var m=D.mix, COLS=["var(--brand)","#5a93e8","var(--red)","#9bbbe0","#c7d6ea"];
  var rows=m.rows.map(function(r){
    var bar=r.values.map(function(v,i){
      var c=COLS[i%COLS.length], dark=(i===0||i===2);
      return '<span style="width:'+v+'%;background:'+c+';color:'+(dark?"#fff":"var(--brand-deep)")+'" title="'+esc(m.cats[i])+' '+v+'%">'+(v>=8?v+"%":"")+'</span>';
    }).join("");
    return '<div class="mixrow"><div class="seglab">'+esc(r.seg)+'</div><div class="mixbar">'+bar+'</div><div class="n">'+esc(r.n)+'</div></div>';
  }).join("");
  var legend=m.cats.map(function(c,i){return '<span><i style="background:'+COLS[i%COLS.length]+'"></i>'+esc(c)+'</span>';}).join("");
  $("#mix").innerHTML='<div class="chart-head"><div><h2 class="h">'+esc(m.title)+'</h2><p class="h-sub">'+esc(m.sub)+'</p></div></div>'+
    rows+'<div class="legend">'+legend+'</div><p class="card-note">'+esc(m.note)+'</p>'+(m.caveat?'<p class="caveat">'+esc(m.caveat)+'</p>':'');
}

/* ---------- trending ---------- */
function renderTrendingTwo(){
  var c=D.v2.cuts[v2cut];
  var groups=[
    {title:"What customers ask "+(v2cut==="IAS"?"IAS":"IES")+" to do",sub:"Gong · capability demand · % of "+c.calls.toLocaleString()+" calls",rows:c.capability},
    {title:"Migration paths in",sub:"Gong · % of "+c.calls.toLocaleString()+" calls",rows:c.migration}
  ];
  $("#trendingTwo").innerHTML=groups.map(function(g){
    var max=Math.max.apply(null,g.rows.map(function(r){return r[1];}))||1;
    var rows=g.rows.map(function(r,i){
      return '<div class="trank"><div class="rk">'+(i+1)+'</div><div class="tt">'+esc(r[0])+'</div>'+
        '<div class="meter"><i class="fill-brand" style="width:'+(100*r[1]/max)+'%"></i></div>'+
        '<div class="vv num">'+r[1]+' · '+(Math.round(1000*r[1]/c.calls)/10)+'%</div></div>';
    }).join("");
    return '<div class="card"><h2 class="h" style="font-size:.95rem">'+esc(g.title)+'</h2><p class="h-sub">'+esc(g.sub)+'</p><div style="margin-top:8px">'+rows+'</div></div>';
  }).join("");
}

/* ---------- Top 100 firm watchlist ---------- */
function renderFirmWatch(){
  var W=D.v2.firms[v2cut]; if(!W){return;}
  var c=D.v2.cuts[v2cut], SIG={critical:"Critical",high:"High",medium:"Medium",watch:"Watch"};
  var list=W.filter(function(r){return firmFilter==="all"||r.signal==="critical"||r.signal==="high";});
  var body=list.map(function(r,i){
    var did="fw-"+v2cut+"-"+i;
    var sent=r.sentiment==="positive"?"green":r.sentiment==="negative"?"red":"neutral";
    var top3=(r.top3||[]).map(function(t){return t[0]+" ×"+t[1];}).join(" · ");
    var detail='<tr class="fdetail" id="'+did+'"><td colspan="7"><div class="fdetail-in">'+
      (top3?'<span class="lab">Churn signals in this firm\'s calls</span><p class="fwbd">'+esc(top3)+'</p>':'')+
      (r.snippet?'<span class="lab">Call snippet</span><blockquote>'+esc(r.snippet)+'</blockquote>':'')+
      (r.cosell?'<div class="kvline"><span class="lab">⚠ Co-sell</span> '+r.cosell_n+' calls flagged co-sell / coaching — call count is inflated, read the deal count.</div>':'')+
      '</div></td></tr>';
    return '<tr class="frow" data-d="'+did+'" tabindex="0" role="button">'+
      '<td><div class="fwfirm">'+esc(cleanFirm(r.firm))+' <span class="chev">›</span></div><div class="fwsub">'+r.tier+(r.cosell?' · <span class="cosellflag">co-sell</span>':'')+'</div></td>'+
      '<td><span class="sigbadge '+r.signal+'">'+SIG[r.signal]+'</span></td>'+
      '<td class="num">'+r.calls+'</td>'+
      '<td class="num">'+r.deals+'</td>'+
      '<td class="num">'+(r.dollars?'$'+fmtM(r.dollars):'—')+'</td>'+
      '<td class="fwissue">'+esc(r.issue)+'</td>'+
      '<td><span class="tag '+sent+'">'+esc(r.sentiment)+'</span></td></tr>'+detail;
  }).join("");
  var cov=c.deals?Math.round(100*c.dollars_cov/c.deals):0;
  $("#firmWatch").innerHTML=
   '<div class="chart-head"><div><h2 class="h">Top 100 firm watchlist — '+v2cut+'</h2><p class="h-sub">'+c.firms+' firms · sorted by tier then signal · calls include co-sell/coaching, read deals too</p></div>'+
   '<div class="fwtoggles"><button class="fwtog'+(firmFilter==="all"?" on":"")+'" data-ff="all">All firms</button>'+
   '<button class="fwtog'+(firmFilter==="high"?" on":"")+'" data-ff="high">High signal</button></div></div>'+
   '<div class="tablewrap"><table class="ftable"><thead><tr><th>Firm</th><th>Signal</th><th class="num">Calls</th><th class="num">Deals</th><th class="num">$ lost</th><th>Top issue</th><th>Sentiment</th></tr></thead><tbody>'+body+'</tbody></table></div>'+
   '<div class="fnote">Signal = churn-driver density (directional); co-sell firms capped down. $ lost = Salesforce closed-lost (linked, ~'+cov+'% coverage — a floor). <b>Calls include co-sell/coaching viral calls; deals is the truer count.</b> Diamond firms (T1 with 10+ calls) carry the firm-level read.</div>';
  Array.prototype.slice.call(document.querySelectorAll("#firmWatch [data-ff]")).forEach(function(b){b.addEventListener("click",function(){firmFilter=b.dataset.ff;renderFirmWatch();});});
  Array.prototype.slice.call(document.querySelectorAll("#firmWatch .frow")).forEach(function(tr){
    function toggle(){var d=document.getElementById(tr.dataset.d);if(d){tr.classList.toggle("open",d.classList.toggle("show"));}}
    tr.addEventListener("click",toggle);
    tr.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();toggle();}});
  });
}

/* ---------- Top 100 gaps: the takeaway (hero cards) ---------- */
function renderGaps(){
  var G = (v2cut==="IAS") ? D.iasGaps : D.top100churn; if(!G){return;}
  var cards=G.rows.map(function(r,i){
    var bullets=(r.bullets||[]).map(function(b){return '<li>'+esc(b)+'</li>';}).join("");
    var did="gap-"+r.rank;
    return '<div class="gapcard '+r.signal+'">'+
      '<div class="gaptop"><span class="gapnum">'+(i+1)+'</span><span class="gapstat num">'+esc(r.metric)+'</span></div>'+
      '<h3 class="gaptitle">'+esc(r.title)+'</h3>'+
      '<p class="gapsowhat">'+esc(r.sowhat||"")+'</p>'+
      '<button class="gapmore" data-g="'+did+'">Why &amp; who ›</button>'+
      '<div class="gapdetail" id="'+did+'">'+
        (bullets?'<ul class="fbullets">'+bullets+'</ul>':'')+
        (r.verbatim?'<blockquote>“'+esc(r.verbatim)+'”</blockquote><span class="who">'+esc(r.who||"")+'</span>':'')+
        (r.keyfirms?'<div class="kvline"><span class="lab">Key firms</span> '+esc(r.keyfirms)+'</div>':'')+
        (r.aisignal?'<div class="kvline"><span class="lab">AI signal</span> '+esc(r.aisignal)+'</div>':'')+
      '</div></div>';
  }).join("");
  $("#gapsSection").innerHTML='<div class="gapshead">'+esc(G.headline)+'</div><p class="gapssub">'+esc(G.sub)+'</p>'+
    '<div class="gapgrid">'+cards+'</div>'+(G.caveat?'<div class="fnote" style="margin-top:14px">'+esc(G.caveat)+'</div>':'');
  Array.prototype.slice.call(document.querySelectorAll("#gapsSection .gapmore")).forEach(function(b){
    b.addEventListener("click",function(){var d=document.getElementById(b.dataset.g);var open=d.classList.toggle("show");b.innerHTML=open?"Hide ‹":"Why &amp; who ›";});
  });
}

/* reusable rich expandable insight table (friction-table styling) */
function renderInsightTable(sel, cfg){
  if(!cfg){return;}
  var key=sel.replace("#",""), SIG={critical:"Critical",high:"High",medium:"Medium"}, BARS={critical:3,high:2,medium:1};
  var rows=cfg.rows.map(function(r){
    var meter='<span class="fmeter '+r.signal+'">'+[0,1,2].map(function(i){return '<i class="'+(i<BARS[r.signal]?"on":"")+'"></i>';}).join("")+'</span>';
    var bullets=(r.bullets||[]).map(function(b){return '<li>'+esc(b)+'</li>';}).join("");
    var did=key+"-d-"+r.rank;
    var detail='<tr class="fdetail" id="'+did+'"><td colspan="6"><div class="fdetail-in">'+
      (bullets?'<span class="lab">Why it matters</span><ul class="fbullets">'+bullets+'</ul>':'')+
      (r.verbatim?'<span class="lab">What they said</span><blockquote>“'+esc(r.verbatim)+'”</blockquote><span class="who">'+esc(r.who||"")+'</span>':'')+
      (r.keyfirms?'<div class="kvline"><span class="lab">Key firms</span> '+esc(r.keyfirms)+'</div>':'')+
      (r.aisignal?'<div class="kvline"><span class="lab">AI signal</span> '+esc(r.aisignal)+'</div>':'')+
      '</div></td></tr>';
    return '<tr class="frow" data-d="'+did+'" tabindex="0" role="button">'+
      '<td><span class="frk">'+r.rank+'</span></td>'+
      '<td class="ftheme">'+esc(r.title)+' <span class="chev">›</span></td>'+
      '<td class="fprod">'+esc(r.product||"")+'</td>'+
      '<td class="fcat">'+esc(r.stage||"")+'</td>'+
      '<td><span class="sigwrap"><span class="sigbadge '+r.signal+'">'+SIG[r.signal]+'</span>'+meter+'</span></td>'+
      '<td class="ffirms num">'+esc(r.metric||"")+'</td></tr>'+detail;
  }).join("");
  $(sel).innerHTML='<div class="chart-head"><div><h2 class="h">'+esc(cfg.title)+'</h2><p class="h-sub">'+esc(cfg.sub)+'</p></div></div>'+
    '<div class="tablewrap"><table class="ftable"><thead><tr><th>#</th><th>'+esc(cfg.col1||"Theme")+'</th><th>Product</th><th>'+esc(cfg.col3||"Stage")+'</th><th>Signal strength</th><th class="num">'+esc(cfg.col5||"Reach")+'</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+
    (cfg.caveat?'<div class="fnote">'+esc(cfg.caveat)+'</div>':'');
  Array.prototype.slice.call($(sel).querySelectorAll(".frow")).forEach(function(tr){
    function toggle(){var d=document.getElementById(tr.dataset.d);if(d){tr.classList.toggle("open",d.classList.toggle("show"));}}
    tr.addEventListener("click",toggle);
    tr.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();toggle();}});
  });
}

/* ---------- coverage ---------- */
function renderCoverage(){
  var rows=D.coverage.map(function(c){
    return '<tr><td><b>'+esc(c.src)+'</b></td><td class="num">'+esc(c.vol)+'</td><td>'+esc(c.reach)+'</td><td><span class="status '+c.status+'">'+esc(c.status)+'</span></td></tr>';
  }).join("");
  $("#coverage").innerHTML='<div class="chart-head"><div><h2 class="h">Where the signal comes from</h2><p class="h-sub">Breadth of source = confidence in the findings</p></div></div>'+
    '<table class="covtable"><thead><tr><th>Source</th><th>Volume</th><th>Reach</th><th>Status</th></tr></thead><tbody>'+rows+'</tbody></table>';
}

/* ---------- verbatims (filtered) ---------- */
function matches(s){
  if(s.commentary) return false;
  if(state.lane!=="all" && LANES[state.lane] && LANES[state.lane].indexOf(s.src)<0) return false;
  if(state.segment){ var seg=s.seg||""; if(seg.toLowerCase().indexOf(state.segment.toLowerCase().split(" ")[0].toLowerCase())<0 && !(state.segment==="Mid-Market"&&seg==="MM")) {
       // map MM<->Mid-Market
       var ok=(state.segment==="Mid-Market"&&seg==="MM")||(seg.toLowerCase()===state.segment.toLowerCase());
       if(!ok) return false;
  }}
  if(state.product){ var p=(s.prod||"").toLowerCase(), want=state.product.toLowerCase();
     if(want.indexOf("ies")===0){ if(p.indexOf("ies")<0 && p!=="both") return false; }
     else if(want.indexOf("ias")===0||want.indexOf("accountant")>=0){ if(p.indexOf("ias")<0 && p!=="both") return false; }
     else { /* other products: keep only if text/theme mentions it */ if((s.text+" "+s.theme).toLowerCase().indexOf(state.product.split(" ")[0].toLowerCase())<0) return false; }
  }
  if(state.source && s.src!==state.source) return false;
  if(state.theme && s.theme!==state.theme) return false;
  if(state.sentiment && s.sentiment!==state.sentiment) return false;
  if(state.q){ if((s.text+" "+s.theme+" "+(s.who||"")).toLowerCase().indexOf(state.q)<0) return false; }
  return true;
}
function renderVerbatims(filtered){
  var anyFilter = state.segment||state.product||state.source||state.theme||state.sentiment||state.q||state.lane!=="all";
  var list = filtered.slice();
  // lead with quotes, then alerts first
  list.sort(function(a,b){
    var av=a.type==="verbatim"?0:1, bv=b.type==="verbatim"?0:1;
    if(av!==bv) return av-bv;
    return (SENT_ORDER[a.sentiment]-SENT_ORDER[b.sentiment]);
  });
  if(!anyFilter) list = list.filter(function(s){return s.type==="verbatim";});
  var CAP = anyFilter?120:14, shown=list.slice(0,CAP);
  if(!shown.length){
    $("#verbatims").innerHTML='<div class="card empty" style="grid-column:1/-1"><h3>No signals match these filters</h3><p>Loosen a filter or clear the search to see more.</p></div>';
    return;
  }
  var SRCLAB={"derived/analysis":"Analysis","Time in Motion":"Time in Motion","Gong":"Gong","ECE":"ECE","Heartbeat":"Heartbeat","Roundtable":"Roundtable"};
  $("#verbatims").innerHTML = shown.map(function(s){
    var sc = (s.type==="verbatim") ? similarCount(s.count) : null;
    var cnt = sc? '<div class="vcount num">'+esc(sc)+'<small>n similar</small></div>':'';
    var seg = s.seg && s.seg!=="cross" && s.seg!=="unknown" ? '<span class="chip">'+esc(s.seg==="MM"?"Mid-Market":s.seg)+'</span>':'';
    var prod = s.prod && s.prod!=="unknown" ? '<span class="chip">'+esc(s.prod==="both"?"IES / IAS":s.prod)+'</span>':'';
    var who = s.who? '<span class="who">'+esc(s.who)+'</span>':'';
    return '<div class="vcard '+s.sentiment+'">'+
      '<div class="vtop"><span class="tag '+s.sentiment+'">'+esc(s.theme)+'</span>'+cnt+'</div>'+
      '<blockquote>'+esc(s.text)+'</blockquote>'+
      '<div class="vfoot"><span class="chip src">'+esc(SRCLAB[s.src]||s.src)+'</span>'+seg+prod+who+'</div></div>';
  }).join("") + (list.length>CAP? '<div class="card empty" style="grid-column:1/-1;padding:14px"><p>Showing '+CAP+' of '+list.length+' — narrow with a filter to see the rest.</p></div>':'');
}

/* ---------- Heartbeat panel ---------- */
function renderHeartbeat(){
  var H=D.heartbeat; if(!H){return;}
  function rows(arr,kind){return arr.map(function(r){
    return '<div class="hbrow"><div class="hbq">'+esc(r.q)+'</div><div class="hbsc '+kind+'"><b>'+esc(r.score)+'</b><small>'+esc(r.pct)+'</small></div></div>';
  }).join("");}
  $("#heartbeat").innerHTML=
   '<div class="chart-head"><div><h2 class="h">What sellers feel</h2><p class="h-sub">Heartbeat daily survey · 1–5 agree scale · '+esc(H.window)+'</p></div>'+
   '<div class="hbstat"><span><b>'+esc(H.sentiment)+'</b> avg sentiment</span><span><b>'+esc(H.response)+'</b> response</span><span><b>'+esc(H.n)+'</b> records</span></div></div>'+
   '<div class="hbgrid"><div class="hbcol"><div class="hbcap good">What\'s working</div>'+rows(H.top,"good")+'</div>'+
   '<div class="hbcol"><div class="hbcap bad">What\'s not</div>'+rows(H.bottom,"bad")+'</div></div>';
}

/* ---------- friction table (signal strength) ---------- */
function renderFriction(){
  var F=D.friction; if(!F){return;}
  var SIG={critical:"Critical",high:"High",medium:"Medium"}, BARS={critical:3,high:2,medium:1};
  var rows=F.filter(function(r){return frictionFilter[r.signal];}).map(function(r){
    var meter='<span class="fmeter '+r.signal+'">'+[0,1,2].map(function(i){return '<i class="'+(i<BARS[r.signal]?"on":"")+'"></i>';}).join("")+'</span>';
    var detail='<tr class="fdetail" id="fd-'+r.rank+'"><td colspan="6"><div class="fdetail-in"><span class="lab">Linked verbatim</span><blockquote>“'+esc(r.verbatim||"To be confirmed against the Gong source.")+'”</blockquote><span class="who">'+esc(r.who)+'</span></div></td></tr>';
    return '<tr class="frow" data-rank="'+r.rank+'" tabindex="0" role="button">'+
      '<td><span class="frk">'+r.rank+'</span></td>'+
      '<td class="ftheme">'+esc(r.theme)+' <span class="chev">›</span></td>'+
      '<td class="fprod">'+esc(r.product)+'</td>'+
      '<td class="fcat">'+esc(r.category)+'</td>'+
      '<td><span class="sigwrap"><span class="sigbadge '+r.signal+'">'+SIG[r.signal]+'</span>'+meter+'</span></td>'+
      '<td class="ffirms num">'+esc(r.firms)+'</td></tr>'+detail;
  }).join("");
  var toggles=["critical","high","medium"].map(function(s){return '<button class="sigtoggle '+s+(frictionFilter[s]?" on":"")+'" data-sig="'+s+'">'+SIG[s]+'</button>';}).join("");
  $("#friction").innerHTML=
    '<div class="chart-head"><div><h2 class="h">Top customer friction points</h2><p class="h-sub">Gong call analytics across Top 30–100 firm conversations · signal strength = firm-citation breadth × deal-blocker weight</p></div>'+
    '<div class="sigtoggles"><span class="sigtoglab">Signal strength</span>'+toggles+'</div></div>'+
    '<div class="fnote">Directional — not a representative sample of all Top firms. Tap a row for the linked verbatim.</div>'+
    '<div class="tablewrap"><table class="ftable"><thead><tr><th>#</th><th>Friction theme</th><th>Product</th><th>Category</th><th>Signal strength</th><th class="num">Firms heard</th></tr></thead><tbody>'+(rows||'<tr><td colspan="6" style="padding:18px;color:var(--muted)">No themes at this signal strength — toggle one on.</td></tr>')+'</tbody></table></div>';
  Array.prototype.slice.call(document.querySelectorAll("#friction .sigtoggle")).forEach(function(b){b.addEventListener("click",function(){frictionFilter[b.dataset.sig]=!frictionFilter[b.dataset.sig];renderFriction();});});
  Array.prototype.slice.call(document.querySelectorAll("#friction .frow")).forEach(function(tr){
    function toggle(){var d=document.getElementById("fd-"+tr.dataset.rank);if(d){tr.classList.toggle("open",d.classList.toggle("show"));}}
    tr.addEventListener("click",toggle);
    tr.addEventListener("keydown",function(e){if(e.key==="Enter"||e.key===" "){e.preventDefault();toggle();}});
  });
}

/* ---------- live filter summary ---------- */
function renderSummary(filtered){
  var box=$("#filtersummary");
  var LANELAB={top100:"Top 100 Firms",customer:"Customer",field:"Field"}, SRCL={"derived/analysis":"Analysis"};
  var chips=[];
  function chip(label,key){return '<button class="fchip" data-clear="'+key+'">'+esc(label)+' <span>×</span></button>';}
  if(state.lane!=="all" && LANELAB[state.lane]) chips.push(chip(LANELAB[state.lane],"lane"));
  if(state.segment) chips.push(chip("Segment · "+state.segment,"segment"));
  if(state.product) chips.push(chip("Product · "+state.product,"product"));
  if(state.source) chips.push(chip("Source · "+(SRCL[state.source]||state.source),"source"));
  if(state.theme) chips.push(chip("Theme · "+state.theme,"theme"));
  if(state.sentiment) chips.push(chip("Sentiment · "+state.sentiment,"sentiment"));
  if(state.q) chips.push(chip('Search · "'+state.q+'"',"q"));
  var c={red:0,amber:0,green:0,neutral:0};
  filtered.forEach(function(s){c[s.sentiment]=(c[s.sentiment]||0)+1;});
  var bd='<span class="sb"><i class="dot-red"></i>'+c.red+' alert</span><span class="sb"><i class="dot-amber"></i>'+c.amber+' caution</span><span class="sb"><i class="dot-green"></i>'+c.green+' positive</span>';
  var html='<div class="inner">';
  if(chips.length) html+='<div class="chips">'+chips.join("")+'<button class="fchip clear" data-clear="all">Clear all ×</button></div>';
  html+='<div class="sumcount"><b class="num">'+filtered.length+'</b> matching signal'+(filtered.length===1?'':'s')+' · '+bd+(chips.length?'':' · <span class="hint">pick a filter, search, or click a word below to drill in</span>')+'</div></div>';
  box.innerHTML=html;
  Array.prototype.slice.call(box.querySelectorAll("[data-clear]")).forEach(function(b){b.addEventListener("click",function(){clearFilter(b.dataset.clear);});});
}
function clearFilter(key){
  if(key==="all"){state.segment=state.product=state.source=state.theme=state.sentiment=state.q="";["#f-segment","#f-product","#f-source","#f-theme","#f-sentiment"].forEach(function(i){$(i).value="";});$("#f-search").value="";}
  else if(key==="lane"){selectLane("all");if(location.hash)location.hash="all";}
  else if(key==="q"){state.q="";$("#f-search").value="";}
  else {state[key]="";var map={segment:"#f-segment",product:"#f-product",source:"#f-source",theme:"#f-theme",sentiment:"#f-sentiment"};if(map[key]){$(map[key]).value="";}}
  render();
}
function scrollResults(){var v=$("#verbatims");if(!v)return;window.scrollTo({top:v.getBoundingClientRect().top+window.pageYOffset-80,behavior:"smooth"});}

/* ---------- Themes overview (the 5 questions) ---------- */
function renderThemes(){
  var T=D.themes; if(!T) return;
  var SL={watch:"Watch",gap:"Data gap","on-track":"On track"};
  $("#themes").innerHTML=T.rows.map(function(r){
    return '<div class="themecard '+r.status+'">'+
      '<div class="themetop"><span class="themenum">'+r.n+'</span><span class="themestat '+r.status+'">'+SL[r.status]+'</span></div>'+
      '<h3 class="themename">'+esc(r.name)+'</h3>'+
      '<p class="themeq">'+esc(r.q)+'</p>'+
      '<div class="themeans"><div class="themebig">'+esc(r.stat)+'</div><div class="themebiglab">'+esc(r.statlab)+'</div></div>'+
      '<p class="themebody">'+esc(r.answer)+'</p>'+
      '<div class="themesrc">'+esc(r.sources)+'</div></div>';
  }).join("");
}

/* ---------- Sources / signal-coverage tab ---------- */
function renderSources(){
  var S=D.sources; if(!S) return;
  var LB={green:"Live",yellow:"Partial",red:"Pending"};
  var g=S.rows.filter(function(r){return r.status==="green";}).length,
      y=S.rows.filter(function(r){return r.status==="yellow";}).length,
      r=S.rows.filter(function(r){return r.status==="red";}).length;
  $("#sourcesHealth").innerHTML=
    '<div class="shpill"><span class="sdot green"></span><b>'+g+'</b> live</div>'+
    '<div class="shpill"><span class="sdot yellow"></span><b>'+y+'</b> partial</div>'+
    '<div class="shpill"><span class="sdot red"></span><b>'+r+'</b> pending</div>'+
    '<div class="shmeta">'+S.rows.length+' sources feeding the engine · the daily-automation goal is the gap between green and the rest</div>';
  $("#sourcesGrid").innerHTML=S.rows.map(function(x){
    return '<div class="srccard '+x.status+'">'+
      '<div class="srctop"><span class="sdot '+x.status+'"></span><span class="srcstat '+x.status+'">'+LB[x.status]+'</span></div>'+
      '<div class="srcname">'+esc(x.name)+'</div>'+
      '<div class="srcvol">'+esc(x.volume)+'</div>'+
      '<div class="srckv"><span>Frequency</span><b>'+esc(x.freq)+'</b></div>'+
      '<div class="srckv"><span>Last pull</span><b>'+esc(x.last)+'</b></div>'+
      '<div class="srcnote">'+esc(x.note)+'</div></div>';
  }).join("");
  $("#sourcesFoot").innerHTML="Live = flowing and current · Partial = loaded but stale or manual · Pending = not yet connected. "+
    "Next: automate the Gong daily feed, stand up Pulse, and fold Cresta in.";
}

/* ---------- master render ---------- */
function render(){
  var isSources = state.lane==="sources";
  $("#lane-sources").classList.toggle("hidden",!isSources);
  document.querySelector(".filterbar").classList.toggle("hidden",isSources);
  if(isSources){
    $("#lane-data").classList.add("hidden");
    $("#lane-empty").classList.add("hidden");
    renderSources();
    return;
  }
  var empty = state.lane==="partners"||state.lane==="investors";
  $("#lane-data").classList.toggle("hidden",empty);
  $("#lane-empty").classList.toggle("hidden",!empty);
  if(empty){
    $("#empty-title").textContent = state.lane==="partners"?"Partner signals":"Investor signals";
    $("#filtersummary").innerHTML="";
    return;
  }
  // Top 100 and Customer lanes hide field-only (Time-in-Motion) panels to stay on the customer-firm story
  var hideField = (state.lane==="top100"||state.lane==="customer");
  var hideCustomer = (state.lane==="field");
  Array.prototype.slice.call(document.querySelectorAll(".fieldonly")).forEach(function(el){el.classList.toggle("hidden",hideField);});
  Array.prototype.slice.call(document.querySelectorAll(".customeronly")).forEach(function(el){el.classList.toggle("hidden",hideCustomer);});
  // data lens: closed-lost (Gong) vs ECE AI-demand vs both — reshapes the customer views
  Array.prototype.slice.call(document.querySelectorAll(".lenstog")).forEach(function(b){b.classList.toggle("on",b.dataset.lens===dataLens);});
  Array.prototype.slice.call(document.querySelectorAll(".lossonly")).forEach(function(el){el.classList.toggle("hidden",dataLens==="ece");});
  Array.prototype.slice.call(document.querySelectorAll(".eceonly")).forEach(function(el){el.classList.toggle("hidden",dataLens==="loss");});
  var lm=$("#lensmeta"); if(lm){lm.innerHTML = dataLens==="loss"?"closed-lost Gong · 105 firms · $9.5M" : (dataLens==="ece"?"ECE demo calls · 21 firms · AI / Agent Studio" : "both sources shown");}
  // source filter reshapes the field panels: TIM section shows for TIM, Heartbeat section for Heartbeat
  Array.prototype.slice.call(document.querySelectorAll(".srcsec")).forEach(function(el){el.classList.toggle("hidden", !(state.source===""||state.source===el.dataset.src));});
  $("#scorecardSec").classList.toggle("hidden", state.lane!=="all"); // program rollup only on the All view
  $("#themesSec").classList.toggle("hidden", state.lane!=="all"); // themes overview only on the All view
  var filtered = D.signals.filter(matches);
  renderScorecard();renderThemes();renderKPIs(filtered);renderTimeseries();renderMix();renderHeartbeat();
  renderCutbar();renderGaps();renderIesVsIas();renderInsightTable("#eceTable",D.eceThemes);renderFirmWatch();renderCompetitors();
  renderTrendingTwo();renderFriction();renderEcePanel();
  renderWordcloud(filtered);
  renderSummary(filtered);
  renderVerbatims(filtered);
}
selectLane((location.hash||"").replace("#",""));
render();
})();
