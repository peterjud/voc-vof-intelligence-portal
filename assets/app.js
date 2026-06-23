(function(){
"use strict";
var D = window.VOC_DATA;
var $ = function(s,r){return (r||document).querySelector(s);};
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c];});}
function fmtDate(iso){var m=["January","February","March","April","May","June","July","August","September","October","November","December"];var p=iso.split("-");return m[+p[1]-1]+" "+(+p[2])+", "+p[0];}

var LANES = {customer:["ECE","Gong"], field:["Heartbeat","Time in Motion","Roundtable","derived/analysis"]};
var SENT_ORDER = {red:0,amber:1,green:2,neutral:3};

var state = {lane:"all", segment:"", product:"", source:"", theme:"", sentiment:"", q:""};

/* ---------- header ---------- */
$("#updated").textContent = "Updated "+fmtDate(D.meta.updated);
$("#scope").textContent = (D.meta.confidential?"Confidential · ":"")+D.meta.scope;
$("#foot").innerHTML = "Intuit Commercial Sales · Voice of Customer / Voice of Field · "+D.meta.n_signals+" classified signals across "+D.meta.n_sources+" sources · Confidential — for internal use only.";

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

function bind(id,key){$(id).addEventListener("change",function(){state[key]=this.value;render();});}
bind("#f-segment","segment");bind("#f-product","product");bind("#f-theme","theme");bind("#f-sentiment","sentiment");
$("#f-source").addEventListener("change",function(){state.source=this.value==="Analysis"?"derived/analysis":this.value;render();});
$("#f-search").addEventListener("input",function(){state.q=this.value.trim().toLowerCase();render();});
$("#reset").addEventListener("click",function(){
  state.segment=state.product=state.source=state.theme=state.sentiment=state.q="";
  ["#f-segment","#f-product","#f-source","#f-theme","#f-sentiment"].forEach(function(i){$(i).value="";});
  $("#f-search").value="";render();
});

/* ---------- tabs ---------- */
Array.prototype.slice.call(document.querySelectorAll(".tab")).forEach(function(t){
  t.addEventListener("click",function(){
    document.querySelectorAll(".tab").forEach(function(x){x.setAttribute("aria-selected","false");});
    t.setAttribute("aria-selected","true");
    state.lane=t.dataset.lane;render();
  });
});

/* ---------- KPI ---------- */
function renderKPIs(){
  $("#kpis").innerHTML = D.kpis.map(function(k){
    var cls = k.delta? (k.bad?"bad":"good") : "flat";
    var arrow = k.dir==="down"?"▼":k.dir==="up"?"▲":"→";
    return '<div class="kpi '+k.sentiment+'">'+
      '<div class="seg">'+esc(k.seg)+'</div>'+
      '<div class="lab">'+esc(k.label)+'</div>'+
      '<div class="v num">'+esc(k.value)+'</div>'+
      (k.delta?'<div class="delta '+cls+'">'+arrow+' '+esc(k.delta)+'</div>':'')+
      '<div class="sub">'+esc(k.sub)+'</div></div>';
  }).join("");
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
    svg+'<div class="legend">'+legend+'</div><p class="card-note">'+esc(t.note)+'</p>';
}

/* ---------- word cloud ---------- */
function renderWordcloud(){
  var max=Math.max.apply(null,D.wordcloud.map(function(w){return w[1];}));
  var min=Math.min.apply(null,D.wordcloud.map(function(w){return w[1];}));
  var html=D.wordcloud.map(function(w){
    var sz=(0.85+1.7*(w[1]-min)/(max-min)).toFixed(2);
    var op=(0.6+0.4*(w[1]-min)/(max-min)).toFixed(2);
    return '<button data-term="'+esc(w[0])+'" style="font-size:'+sz+'rem;opacity:'+op+'">'+esc(w[0])+'</button>';
  }).join("");
  $("#wordcloud").innerHTML='<div class="chart-head"><div><h2 class="h">What\'s driving the volume</h2><p class="h-sub">Term frequency across all sources · click a term to filter the verbatims</p></div></div><div class="cloud">'+html+'</div>';
  Array.prototype.slice.call(document.querySelectorAll(".cloud button")).forEach(function(b){
    b.addEventListener("click",function(){state.q=b.dataset.term.toLowerCase();$("#f-search").value=b.dataset.term;render();window.scrollTo({top:document.querySelector('[data-lane]')?$("#verbatims").offsetTop-90:0,behavior:"smooth"});});
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
    rows+'<div class="legend">'+legend+'</div><p class="card-note">'+esc(m.note)+'</p>';
}

/* ---------- trending ---------- */
function renderTrending(){
  $("#trending").innerHTML=D.trending.map(function(g){
    var max=Math.max.apply(null,g.rows.map(function(r){return r.v;}));
    var rows=g.rows.map(function(r,i){
      return '<div class="trank"><div class="rk">'+(i+1)+'</div><div class="tt">'+esc(r.t)+'</div>'+
        '<div class="meter"><i class="fill-'+r.s+'" style="width:'+(100*r.v/max)+'%"></i></div>'+
        '<div class="vv num">'+r.v+' · '+esc(r.p)+'</div></div>';
    }).join("");
    return '<div class="card"><h2 class="h" style="font-size:.95rem">'+esc(g.title)+'</h2><p class="h-sub">'+esc(g.sub)+'</p><div style="margin-top:8px">'+rows+'</div></div>';
  }).join("");
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
function renderVerbatims(){
  var anyFilter = state.segment||state.product||state.source||state.theme||state.sentiment||state.q||state.lane!=="all";
  var list = D.signals.filter(matches);
  // default view: lead with quotes
  list.sort(function(a,b){
    var av=a.type==="verbatim"?0:1, bv=b.type==="verbatim"?0:1;
    if(av!==bv) return av-bv;
    return (SENT_ORDER[a.sentiment]-SENT_ORDER[b.sentiment]);
  });
  if(!anyFilter) list = list.filter(function(s){return s.type==="verbatim";});
  $("#rc").textContent = list.length+" signal"+(list.length===1?"":"s");
  var CAP=120, shown=list.slice(0,CAP);
  if(!shown.length){
    $("#verbatims").innerHTML='<div class="card empty" style="grid-column:1/-1"><h3>No signals match these filters</h3><p>Loosen a filter or clear the search to see more.</p></div>';
    return;
  }
  var SRCLAB={"derived/analysis":"Analysis","Time in Motion":"Time in Motion","Gong":"Gong","ECE":"ECE","Heartbeat":"Heartbeat","Roundtable":"Roundtable"};
  $("#verbatims").innerHTML = shown.map(function(s){
    var cnt = s.count? '<div class="vcount num">'+esc(s.count)+'<small>n similar</small></div>':'';
    var seg = s.seg && s.seg!=="cross" && s.seg!=="unknown" ? '<span class="chip">'+esc(s.seg==="MM"?"Mid-Market":s.seg)+'</span>':'';
    var prod = s.prod && s.prod!=="unknown" ? '<span class="chip">'+esc(s.prod==="both"?"IES / IAS":s.prod)+'</span>':'';
    var who = s.who? '<span class="who">'+esc(s.who)+'</span>':'';
    return '<div class="vcard '+s.sentiment+'">'+
      '<div class="vtop"><span class="tag '+s.sentiment+'">'+esc(s.theme)+'</span>'+cnt+'</div>'+
      '<blockquote>'+esc(s.text)+'</blockquote>'+
      '<div class="vfoot"><span class="chip src">'+esc(SRCLAB[s.src]||s.src)+'</span>'+seg+prod+who+'</div></div>';
  }).join("") + (list.length>CAP? '<div class="card empty" style="grid-column:1/-1;padding:14px"><p>Showing '+CAP+' of '+list.length+' — narrow with a filter to see the rest.</p></div>':'');
}

/* ---------- master render ---------- */
function render(){
  var empty = state.lane==="partners"||state.lane==="investors";
  $("#lane-data").classList.toggle("hidden",empty);
  $("#lane-empty").classList.toggle("hidden",!empty);
  if(empty){
    $("#empty-title").textContent = state.lane==="partners"?"Partner signals":"Investor signals";
    return;
  }
  renderKPIs();renderTimeseries();renderWordcloud();renderMix();renderTrending();renderCoverage();renderVerbatims();
}
render();
})();
