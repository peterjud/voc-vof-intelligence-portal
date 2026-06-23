(function(){
"use strict";
var D = window.VOC_DATA;
var $ = function(s,r){return (r||document).querySelector(s);};
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c];});}
function fmtDate(iso){var m=["January","February","March","April","May","June","July","August","September","October","November","December"];var p=iso.split("-");return m[+p[1]-1]+" "+(+p[2])+", "+p[0];}

var LANES = {top100:["Gong","ECE"], customer:["ECE","Gong"], field:["Heartbeat","Time in Motion","Roundtable","derived/analysis"]};
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
var VALID_LANES=["all","top100","customer","field","partners","investors"];
function selectLane(lane){
  if(VALID_LANES.indexOf(lane)<0) lane="all";
  document.querySelectorAll(".tab").forEach(function(x){x.setAttribute("aria-selected", x.dataset.lane===lane?"true":"false");});
  state.lane=lane;
}
Array.prototype.slice.call(document.querySelectorAll(".tab")).forEach(function(t){
  t.addEventListener("click",function(){selectLane(t.dataset.lane);if(location.hash!=="#"+t.dataset.lane)location.hash=t.dataset.lane;render();});
});
window.addEventListener("hashchange",function(){selectLane((location.hash||"").replace("#",""));render();});

/* ---------- KPI ---------- */
var KPIS_TOP100=[
 {sentiment:"neutral",seg:"Top 100 · Gong",label:"Calls analyzed",value:"1,243",delta:"",dir:"flat",bad:false,sub:"60 of 77 firms · rolling 12 months"},
 {sentiment:"red",seg:"Top 100 · churn",label:"High-priority escalations",value:"62",delta:"",dir:"flat",bad:true,sub:"#1 churn driver · 5.0% of calls"},
 {sentiment:"neutral",seg:"Top 100 · demand",label:"Multi-entity consolidation",value:"299",delta:"",dir:"flat",bad:false,sub:"#1 capability ask · 24.1% of calls"},
 {sentiment:"neutral",seg:"Top 100 · migration",label:"QB Desktop → IES",value:"167",delta:"",dir:"flat",bad:false,sub:"dominant migration path · 13.4%"},
 {sentiment:"amber",seg:"Executive (ECE)",label:"Named AI a top-3 priority",value:"100%",delta:"",dir:"flat",bad:false,sub:"all 7 firms · none had a clear path"}
];
function renderKPIs(){
  var arr = (state.lane==="top100"||state.lane==="customer") ? KPIS_TOP100 : D.kpis;
  $("#kpis").innerHTML = arr.map(function(k){
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

/* ---------- master render ---------- */
function render(){
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
  Array.prototype.slice.call(document.querySelectorAll(".fieldonly")).forEach(function(el){el.classList.toggle("hidden",hideField);});
  var filtered = D.signals.filter(matches);
  renderKPIs();renderTimeseries();renderMix();renderTrending();renderCoverage();
  renderWordcloud(filtered);
  renderSummary(filtered);
  renderVerbatims(filtered);
}
selectLane((location.hash||"").replace("#",""));
render();
})();
