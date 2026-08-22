
/* ===== garments ===== */
const G={
 tee:'<path d="M30 22 L44 14 Q50 19 56 14 L70 22 L82 36 L72 47 L65 40 L65 112 L35 112 L35 40 L28 47 L18 36 Z"/>',
 dress:'<path d="M35 18 L45 12 Q50 16 55 12 L65 18 L60 40 M40 40 L30 116 L70 116 L60 40 L65 18 M40 40 L35 18 M40 40 L60 40"/>',
 blazer:'<path d="M32 20 L46 15 L50 44 L54 15 L68 20 L73 114 L55 114 L51 56 L49 56 L45 114 L27 114 Z"/><path d="M46 15 L50 44 L54 15" opacity=".55"/>',
 coat:'<path d="M30 18 L46 13 L50 40 L54 13 L70 18 L75 122 L55 122 M55 122 L25 122 L20 28 Z M20 28 L30 18 M70 18 L80 28 L75 122"/><path d="M50 40 L50 118" opacity=".5"/>',
 knit:'<path d="M28 24 L42 17 Q50 21 58 17 L72 24 L84 42 L74 54 L66 46 L66 110 L34 110 L34 46 L26 54 L16 42 Z"/>',
 trousers:'<path d="M33 16 L67 16 L66 60 L56 116 L46 116 L50 64 L44 116 L34 116 Z"/><path d="M50 30 L50 60" opacity=".5"/>',
 skirt:'<path d="M35 24 L65 24 L74 110 L26 110 Z"/><path d="M44 40 L40 110 M56 40 L60 110" opacity=".35"/>'
};
function garment(k,c){return '<svg class="garment" viewBox="0 0 100 130" fill="none" stroke="'+(c||'currentColor')+'" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">'+(G[k]||G.tee)+'</svg>';}

/* ===== colour + fabric ===== */
const COLORS=[{n:'Ink',h:'#1B1A14'},{n:'Bone',h:'#E7E1D3'},{n:'Washed indigo',h:'#3C4C68'},{n:'Clay',h:'#B07A5B'},{n:'Sage',h:'#8B9079'},{n:'Cobalt',h:'#1F2BD6'},{n:'Oat',h:'#CDBFA6'},{n:'Char',h:'#4A4944'},{n:'Rust',h:'#9C4A2E'},{n:'Stone',h:'#9A968B'}];
const FAB_TEX={'Organic cotton':'tex-jersey','Satin':'tex-satin','Merino wool':'tex-knit','Rib knit':'tex-rib','Tencel':'tex-satin','Linen':'tex-linen','Recycled poly':'tex-jersey','Technical shell':'tex-twill','Denim':'tex-denim','Twill':'tex-twill'};
function shade(hex,amt){let n=parseInt(hex.slice(1),16);let r=(n>>16)+amt,g=((n>>8)&255)+amt,b=(n&255)+amt;r=Math.max(0,Math.min(255,r));g=Math.max(0,Math.min(255,g));b=Math.max(0,Math.min(255,b));return '#'+(r<<16|g<<8|b).toString(16).padStart(6,'0');}
function texClass(f){return FAB_TEX[f]||'tex-jersey';}
/* material study tile */
/* photography with graceful texture fallback (resolves image loading completely) */
const IMG={
  slip:"https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=700&q=80",
  sheer:"https://images.unsplash.com/photo-1485462537746-965f33f7f6a7?w=700&q=80",
  skirt:"https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?w=700&q=80",
  knit:"https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=700&q=80",
  sunlit:"https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=700&q=80",
  corset:"https://images.unsplash.com/photo-1539008835657-9e8e9680c956?w=700&q=80",
  wrap:"https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=700&q=80",
  tailor:"https://images.unsplash.com/photo-1483985988355-763728e1935b?w=700&q=80",
  menshirt:"https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=700&q=80",
  menknit:"https://images.unsplash.com/photo-1516257984-b1b4d707412e?w=700&q=80",
  mentrouser:"https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=700&q=80"
};
let USE_PHOTOS=true;
function photoFor(g,mood,gd){const men=gd==='men';switch(g){
  case 'dress':return mood==='Romantic'?IMG.slip:IMG.sunlit;
  case 'knit':return men?IMG.menknit:IMG.knit;
  case 'trousers':return men?IMG.mentrouser:IMG.tailor;
  case 'coat':return IMG.tailor; case 'blazer':return men?IMG.menshirt:IMG.tailor;
  case 'skirt':return IMG.skirt; case 'tee':return men?IMG.menshirt:IMG.corset;
  default:return IMG.slip;}}
function mtile(opts){
  const{color='#4A4944',fabric='Organic cotton',garmentKey='dress',img,style=''}=opts;
  const lite=shade(color,44);
  // v11 approach: simple image that fills its container. Color+garment are the fallback.
  const fallbackSvg=`<div class="mt-fallback">${garment(garmentKey,'#fff')}</div>`;
  const photoUrl=img||null;
  if(photoUrl){
    return `<div class="mtile" style="background:${lite};${style}"><img src="${photoUrl}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">${fallbackSvg}</div>`;
  }
  return `<div class="mtile" style="background:linear-gradient(160deg,${lite},${color} 55%);${style}">${fallbackSvg}</div>`;
}
/* ===== explainability: why / confidence / attribute match ===== */
const WHY={
 'Sheer rib knit':'Shoppers keep asking for translucent knit and almost no one in your tier makes it well — sits dead-on your minimal, tonal codes.',
 'Architectural wide trouser':'Your wide trousers already outsell the category; demand is widening to a cleaner, higher-waisted cut you don\u2019t offer yet.',
 'Unlined chore coat':'Steady menswear demand for an unlined, soft-structure coat above the fast-fashion tier — thin supply, strong fit to your utility codes.',
 'Washed indigo barrel jean':'Search and resale on washed-indigo barrel legs are climbing while competitor supply lags. Your denim sell-through supports it.',
 'Bias-cut slip dress':'Constant demand for a true bias midi slip — everyone makes the mini. Your satin and bias codes match almost exactly.',
 'Soft-shoulder blazer':'Rising demand for soft-tailored blazers in fluid wool; your tailoring sell-through runs above house average.',
 'Garment-dyed mini tee':'Parents are asking for elevated, garment-dyed basics in kids — quiet demand, thin premium supply.',
 'Drop-waist midi skirt':'Emerging romantic silhouette with low direct-competitor coverage; pairs with your strongest fabrics.',
 'Cropped puffer':'High social sentiment but purchase intent is softening — watch before you buy.',
 'Heavyweight box tee':'Well-supplied at the low end; the only real opening is fabric weight and hand, not the silhouette.',
 'Loose carpenter pant':'Plenty of noise, declining conversion — keep on the radar, don\u2019t commit.',
 'Pinafore dress':'Social interest without matching purchase intent in your price band — watch only.'
};
function whyFor(t){return WHY[t.name]||('Demand is rising in '+t.cat.toLowerCase()+' where competitor supply is thin and it sits close to your brand codes.');}
function confLevel(t){return t.score>=85?['High','high']:t.score>=70?['Medium','med']:['Emerging','exp'];}
function brandsObs(t){return Math.round(t.matches*2.6+11);}
function productsObs(t){return t.signals.toLocaleString();}
// honest two-indicator model: momentum (movement) + evidence confidence (source diversity)
function signalMomentum(t){return t.score;} // existing score is a movement index — labelled as momentum, not a composite
function signalEvidence(t){
  // confidence from how many source groups corroborate — derived, labelled
  const groups=(t.geo?1:0)+(t.resale?1:0)+(t.signals>400?1:0)+(t.brand?1:0)+1;
  return groups>=4?['High','var(--sage)']:groups>=3?['Medium','var(--ochre)']:['Limited','var(--clay)'];
}
// observed lifecycle stage stays; precise quarter peaks become honest windows
function peakWindow(lc){
  if(lc.stage==='Emerging')return 'window opens later — early signal';
  if(lc.stage==='Accelerating')return 'opportunity window: next 8–16 weeks';
  if(lc.stage==='Peaking')return 'at peak now — defend rather than expand';
  return 'past peak — declining';
}
function attrsFor(t){
  const silh={Dress:'Bias cut',Tailoring:'Wide leg',Outerwear:'Soft structure',Denim:'Barrel leg',Knitwear:'Fine gauge'}[t.cat]||'Clean line';
  const len={Dress:'Midi length',Skirt:'Midi length',Tailoring:'High waist',Denim:'High waist'}[t.cat]||'Tonal palette';
  return [[len,Math.min(98,t.demand.f-1)],[t.fabric,Math.min(98,t.demand.f+1)],[silh,Math.max(62,t.demand.d-13)]];
}

/* ===== data ===== */
const KPIS=[
 {lbl:'Net revenue · 30d',val:'€482k',delta:'+18.2%',dir:'up',spark:[40,42,38,46,50,48,57,55,62,68,64,72]},
 {lbl:'Sell-through',val:'71<span>%</span>',delta:'+6.4pts',dir:'up',spark:[52,55,53,58,60,59,63,66,64,68,70,71]},
 {lbl:'Stock cover',val:'34<span>days</span>',delta:'−5 days',dir:'down',spark:[48,46,45,44,42,41,40,39,38,37,35,34]},
 {lbl:'Return rate',val:'8.1<span>%</span>',delta:'−1.2pts',dir:'up',spark:[12,11,11,10,10,9.5,9,9,8.6,8.4,8.2,8.1]}
];
const BRIEF=[
 {tag:'restock',label:'Restock',h:'Ribbed merino tank — bone',p:'Sell-through hit 92% in 9 days and stock cover is under a week. Reorder before the indigo capsule pulls attention.',meta:'SKU MR-KNT-114 · €128 · 92% sell-through',act:'Reorder 600'},
 {tag:'scale',label:'Scale',h:'Architectural wide trouser',p:'Top revenue style this month with 64% repeat-buyer rate. Extend into two colourways and a petite grade.',meta:'SKU MR-TRS-052',act:'Open in Studio'},
 {tag:'signal',label:'Signal',h:'Washed indigo is moving',p:'Saves on your indigo posts up 3.1×; two competitors just dropped indigo. 4–6 week window to land a capsule.',meta:'Source · Instagram + market',act:'See signals'},
 {tag:'cut',label:'Mark down',h:'Boxy poplin shirt — clay',p:'Sell-through 19% at week 6, stock cover 88 days. Mark down 20% or pull from the reorder list.',meta:'SKU MR-SHT-077 · €95',act:'Plan markdown'},
 {tag:'source',label:'Source',h:'Lock Tencel for AW26 knit',p:'Your draft board leans 60% Tencel. Lead times are stretching — confirm mill allocation this week.',meta:'AW26 draft · 12 styles',act:'Notify sourcing'}
];
const WINNERS=[
 {g:'trousers',f:'Twill',c:'#4A4944',n:'Wide trouser — char',sku:'MR-TRS-052',v:'92%',spark:[30,34,40,52,60,72,80]},
 {g:'knit',f:'Merino wool',c:'#E7E1D3',n:'Ribbed tank — bone',sku:'MR-KNT-114',v:'88%',spark:[40,46,55,60,70,78,84]},
 {g:'dress',f:'Satin',c:'#1B1A14',n:'Bias slip — ink',sku:'MR-DRS-090',v:'77%',spark:[20,28,33,44,50,58,66]}
];
const TRENDS=[
 {g:'knit',cat:'Knitwear',gd:'women',name:'Sheer rib knit',fabric:'Rib knit',mood:'Minimal',tag:'make',score:94,scol:'#3F6B4F',demand:{d:91,f:96,m:88},yoy:'+212%',geo:'Seoul · Paris',age:'24–34',brand:true,price:240,signals:914,matches:12,resale:'+160%',col:'#9A968B',demandS:[20,28,35,40,52,60,72,84,90,94],sw:['#E7E1D3','#9A968B','#1B1A14']},
 {g:'trousers',cat:'Tailoring',gd:'women',name:'Architectural wide trouser',fabric:'Twill',mood:'Editorial',tag:'make',score:91,scol:'#3F6B4F',demand:{d:88,f:94,m:82},yoy:'+148%',geo:'Milan · NYC',age:'28–42',brand:true,price:280,signals:760,matches:9,resale:'+120%',col:'#4A4944',demandS:[40,44,50,55,62,70,76,82,88,91],sw:['#4A4944','#1B1A14','#CDBFA6']},
 {g:'coat',cat:'Outerwear',gd:'men',name:'Unlined chore coat',fabric:'Twill',mood:'Minimal',tag:'make',score:88,scol:'#3F6B4F',demand:{d:86,f:90,m:78},yoy:'+96%',geo:'Tokyo · Berlin',age:'27–40',brand:true,price:560,signals:540,matches:7,resale:'+85%',col:'#3C4C68',demandS:[30,33,38,45,52,60,68,76,84,88],sw:['#3C4C68','#8B9079','#4A4944']},
 {g:'trousers',cat:'Denim',gd:'women',name:'Washed indigo barrel jean',fabric:'Denim',mood:'On-brand',tag:'test',score:86,scol:'#C8821E',demand:{d:84,f:79,m:90},yoy:'+131%',geo:'LA · London',age:'22–32',brand:true,price:230,signals:611,matches:14,resale:'+131%',col:'#3C4C68',demandS:[18,25,33,42,50,58,66,74,80,86],sw:['#3C4C68','#9A968B','#1B1A14']},
 {g:'dress',cat:'Dress',gd:'women',name:'Bias-cut slip dress',fabric:'Satin',mood:'Romantic',tag:'make',score:82,scol:'#3F6B4F',demand:{d:91,f:98,m:78},yoy:'+74%',geo:'Paris · Copenhagen',age:'25–38',brand:true,price:320,signals:828,matches:17,resale:'+180%',col:'#1B1A14',demandS:[30,32,38,44,50,56,64,72,78,82],sw:['#1B1A14','#B07A5B','#E7E1D3']},
 {g:'blazer',cat:'Tailoring',gd:'men',name:'Soft-shoulder blazer',fabric:'Merino wool',mood:'Elevated',tag:'test',score:79,scol:'#C8821E',demand:{d:76,f:84,m:71},yoy:'+58%',geo:'Florence · Seoul',age:'30–48',brand:true,price:480,signals:430,matches:8,resale:'+60%',col:'#4A4944',demandS:[28,30,34,40,46,52,60,68,74,79],sw:['#4A4944','#1B1A14','#9A968B']},
 {g:'tee',cat:'Knitwear',gd:'kids',name:'Garment-dyed mini tee',fabric:'Organic cotton',mood:'Minimal',tag:'test',score:74,scol:'#C8821E',demand:{d:72,f:80,m:66},yoy:'+41%',geo:'Amsterdam · NYC',age:'3–8',brand:true,price:60,signals:300,matches:11,resale:'+30%',col:'#8B9079',demandS:[26,28,30,36,42,48,56,64,70,74],sw:['#8B9079','#CDBFA6','#B07A5B']},
 {g:'skirt',cat:'Dress',gd:'women',name:'Drop-waist midi skirt',fabric:'Tencel',mood:'Romantic',tag:'test',score:71,scol:'#C8821E',demand:{d:70,f:74,m:64},yoy:'+38%',geo:'London · Stockholm',age:'24–36',brand:false,price:220,signals:280,matches:9,resale:'+44%',col:'#8B9079',demandS:[24,27,30,34,40,46,54,62,68,71],sw:['#4A4944','#9A968B','#CDBFA6']},
 {g:'coat',cat:'Outerwear',gd:'women',name:'Cropped puffer',fabric:'Technical shell',mood:'On-brand',tag:'watch',score:67,scol:'#1F2BD6',demand:{d:70,f:58,m:60},yoy:'+22%',geo:'Seoul · Toronto',age:'18–28',brand:false,price:340,signals:240,matches:6,resale:'+22%',col:'#1B1A14',demandS:[40,42,40,44,48,52,56,60,64,67],sw:['#1B1A14','#9C4A2E','#3C4C68']},
 {g:'tee',cat:'Knitwear',gd:'men',name:'Heavyweight box tee',fabric:'Organic cotton',mood:'Minimal',tag:'watch',score:64,scol:'#1F2BD6',demand:{d:62,f:60,m:55},yoy:'+19%',geo:'LA · Tokyo',age:'20–34',brand:false,price:95,signals:210,matches:18,resale:'+12%',col:'#E7E1D3',demandS:[44,45,46,48,50,53,56,59,62,64],sw:['#E7E1D3','#4A4944','#8B9079']},
 {g:'trousers',cat:'Denim',gd:'men',name:'Loose carpenter pant',fabric:'Denim',mood:'On-brand',tag:'watch',score:61,scol:'#1F2BD6',demand:{d:60,f:54,m:50},yoy:'+17%',geo:'Berlin · NYC',age:'19–30',brand:false,price:210,signals:190,matches:7,resale:'+17%',col:'#3C4C68',demandS:[42,43,44,46,48,51,54,57,60,61],sw:['#3C4C68','#1B1A14','#9A968B']},
 {g:'dress',cat:'Dress',gd:'kids',name:'Pinafore dress',fabric:'Linen',mood:'Romantic',tag:'watch',score:58,scol:'#1F2BD6',demand:{d:56,f:62,m:48},yoy:'+12%',geo:'Paris · London',age:'4–9',brand:false,price:90,signals:170,matches:5,resale:'+8%',col:'#3C4C68',demandS:[40,41,42,44,46,49,52,55,57,58],sw:['#3C4C68','#B07A5B','#E7E1D3']}
];
const COLL=[
 {g:'trousers',f:'Twill',c:'#4A4944',n:'Wide trouser',sku:'MR-TRS-052',st:92,cover:'6d',ret:'6.2%',sig:'win',sigt:'Scale'},
 {g:'knit',f:'Merino wool',c:'#E7E1D3',n:'Ribbed tank',sku:'MR-KNT-114',st:88,cover:'5d',ret:'9.1%',sig:'win',sigt:'Restock'},
 {g:'dress',f:'Satin',c:'#1B1A14',n:'Bias slip',sku:'MR-DRS-090',st:77,cover:'14d',ret:'18.0%',sig:'ok',sigt:'Steady'},
 {g:'blazer',f:'Merino wool',c:'#4A4944',n:'Soft blazer',sku:'MR-BLZ-031',st:63,cover:'22d',ret:'11.4%',sig:'ok',sigt:'Steady'},
 {g:'coat',f:'Twill',c:'#3C4C68',n:'Chore coat',sku:'MR-OUT-018',st:54,cover:'31d',ret:'7.8%',sig:'ok',sigt:'Watch'},
 {g:'tee',f:'Organic cotton',c:'#B07A5B',n:'Boxy poplin shirt',sku:'MR-SHT-077',st:19,cover:'88d',ret:'13.0%',sig:'warn',sigt:'Mark down'}
];
const INTG=[
 {n:'Shopify',c:'#5E8E3E',init:'S',d:'Live orders, products, stock and customer cohorts. Powers analytics and the brief.',linked:true,note:'Synced 4m ago · 3,412 orders'},
 {n:'Instagram',c:'#C13584',init:'IG',d:'Audience signals, saves and engagement — feeds your DNA and the social signal feed.',linked:true,note:'Synced 11m ago · 1.2M reach'},
 {n:'Klaviyo',c:'#1F2BD6',init:'K',d:'Email and flow performance to connect demand signals to revenue.',linked:false,note:'Not connected'},
 {n:'Centra / ERP',c:'#16150F',init:'E',d:'Wholesale and production data for full sell-through and lead-time visibility.',linked:false,note:'Not connected'}
];

/* ===== production feasibility (qualitative — NOT a costing engine) =====
   Real costing depends on supplier, MOQ, currency, duties, freight, negotiated terms —
   none sourceable in a prototype. So we surface a feasibility *signal* from things we
   can reason about: construction complexity, fabric availability, price-band fit. */
const COMPLEXITY={Dress:'Moderate',Knitwear:'Low',Tailoring:'High',Outerwear:'High',Trousers:'Moderate',Skirt:'Low',Tee:'Low'};
const BAND_FIT={Dress:'Premium',Knitwear:'Entry–Core',Tailoring:'Premium',Outerwear:'Premium',Trousers:'Core',Skirt:'Core',Tee:'Entry'};
const FAB_AVAIL={'Organic cotton':'Wide','Satin':'Wide','Merino wool':'Moderate','Tencel':'Wide','Linen':'Wide','Recycled poly':'Wide','Technical shell':'Limited','Rib knit':'Moderate','Twill':'Wide','Denim':'Wide'};
function feasibility(cat,fabric,colorways){
  const complexity=COMPLEXITY[cat]||'Moderate';
  const fabricAvail=FAB_AVAIL[fabric]||'Moderate';
  const bandFit=BAND_FIT[cat]||'Core';
  // a simple, honest readiness: low complexity + available fabric = clear; high complexity or limited fabric = check
  const score=(complexity==='Low'?2:complexity==='Moderate'?1:0)+(fabricAvail==='Wide'?2:fabricAvail==='Moderate'?1:0)-(colorways>2?1:0);
  const ready=score>=3?{lbl:'Clear',col:'var(--sage)'}:score>=2?{lbl:'Workable',col:'var(--ochre)'}:{lbl:'Needs review',col:'var(--clay)'};
  return{complexity,fabricAvail,bandFit,ready,pass:score>=2,
    note:fabricAvail==='Limited'?fabric+' has limited mill availability — lead times stretch.':complexity==='High'?cat.toLowerCase()+' construction is labour-intensive — confirm capacity early.':'Standard construction in your supplier range.'};
}

/* ===== charts ===== */
function spark(data,{w=74,h=30,stroke='var(--cobalt)',fill=false}={}){
  const mn=Math.min(...data),mx=Math.max(...data),rng=(mx-mn)||1;
  const pts=data.map((v,i)=>[i/(data.length-1)*w,h-((v-mn)/rng)*(h-4)-2]);
  const d=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const area=fill?`<path d="${d} L${w} ${h} L0 ${h} Z" fill="${stroke}" opacity=".07"/>`:'';
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" fill="none">${area}<path d="${d}" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function barchart(items,{h=180,max}={}){const w=300;max=max||Math.max(...items.map(i=>i.v));const bw=w/items.length,pad=bw*0.28;
  return `<svg viewBox="0 0 ${w} ${h+24}" width="100%" style="display:block">`+items.map((it,i)=>{const bh=(it.v/max)*h,x=i*bw+pad/2,y=h-bh;
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(bw-pad).toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${it.c||'var(--cobalt)'}"/><text x="${(i*bw+bw/2).toFixed(1)}" y="${h+15}" text-anchor="middle" font-family="IBM Plex Mono,monospace" font-size="9" fill="var(--ink-3)">${it.l}</text>`;}).join('')+`</svg>`;}
function donut(items,{size=170}={}){const tot=items.reduce((a,b)=>a+b.v,0);let a=-Math.PI/2;const r=size/2,ir=r*0.6,cx=r,cy=r;
  const segs=items.map(it=>{const ang=it.v/tot*Math.PI*2,a2=a+ang;const x1=cx+r*Math.cos(a),y1=cy+r*Math.sin(a),x2=cx+r*Math.cos(a2),y2=cy+r*Math.sin(a2);const xi1=cx+ir*Math.cos(a2),yi1=cy+ir*Math.sin(a2),xi2=cx+ir*Math.cos(a),yi2=cy+ir*Math.sin(a);const large=ang>Math.PI?1:0;a=a2;
    return `<path d="M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} L${xi1} ${yi1} A${ir} ${ir} 0 ${large} 0 ${xi2} ${yi2} Z" fill="${it.c}"/>`;}).join('');
  return `<div style="display:flex;align-items:center;gap:20px"><svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${segs}</svg><div style="flex:1">`+items.map(it=>`<div style="display:flex;align-items:center;gap:9px;font-size:12.5px;margin:7px 0"><span style="width:11px;height:11px;border-radius:3px;background:${it.c}"></span><span style="flex:1;font-weight:600">${it.l}</span><span class="mono" style="color:var(--ink-3)">${Math.round(it.v/tot*100)}%</span></div>`).join('')+`</div></div>`;}
function geobars(items){const max=Math.max(...items.map(i=>i.v));return items.map(it=>`<div style="display:flex;align-items:center;gap:12px;margin:11px 0"><span style="width:90px;font-size:12.5px;font-weight:600">${it.l}</span><span class="bar" style="flex:1;width:auto"><i style="width:${it.v/max*100}%"></i></span><span class="mono" style="font-size:11px;color:var(--ink-3);width:42px;text-align:right">${it.v}%</span></div>`).join('');}
function ring(pct,col){const r=24,c=2*Math.PI*r;return `<svg class="fitring" viewBox="0 0 56 56"><circle cx="28" cy="28" r="${r}" fill="none" stroke="var(--hair)" stroke-width="4"/><circle cx="28" cy="28" r="${r}" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c*(1-pct/100)}" transform="rotate(-90 28 28)"/><text x="28" y="32" text-anchor="middle" font-family="var(--serif)" font-size="15" font-weight="500" fill="${col}">${pct}</text></svg>`;}

/* ===== state ===== */
let collection=new Set();
let mode='global',gender='all',tagFilter=null;
let gen={gender:'Women',category:'Dress',garment:'dress',fit:'Regular',fabric:'Organic cotton',mood:'On-brand',colors:['#1B1A14'],sizes:['XS','S','M','L','XL']};
let lastVariants=[];

const TAGLABEL={make:'Make',test:'Test',watch:'Watch'};
const TAGDESC={make:'High demand, missing from your matrix',test:'Emerging — validate with a micro-run',watch:'Strong social, softening purchase intent'};

/* ===== Trend Radar: lifecycle + attribute intelligence ===== */
// lifecycle stage per trend, derived from momentum + tag. weeks = position in a ~40wk cycle
const LIFECYCLE={
 'Sheer rib knit':{stage:'Accelerating',week:14,peak:'Q3 2026',pos:42,dir:'up'},
 'Architectural wide trouser':{stage:'Accelerating',week:18,peak:'Q3 2026',pos:52,dir:'up'},
 'Unlined chore coat':{stage:'Emerging',week:8,peak:'Q4 2026',pos:24,dir:'up'},
 'Washed indigo barrel jean':{stage:'Accelerating',week:16,peak:'Q3 2026',pos:48,dir:'up'},
 'Bias-cut slip dress':{stage:'Peaking',week:28,peak:'now',pos:74,dir:'flat'},
 'Soft-shoulder blazer':{stage:'Emerging',week:10,peak:'Q4 2026',pos:30,dir:'up'},
 'Garment-dyed mini tee':{stage:'Emerging',week:6,peak:'Q1 2027',pos:18,dir:'up'},
 'Drop-waist midi skirt':{stage:'Accelerating',week:13,peak:'Q3 2026',pos:40,dir:'up'},
 'Cropped puffer':{stage:'Declining',week:34,peak:'passed',pos:86,dir:'down'},
 'Heavyweight box tee':{stage:'Peaking',week:26,peak:'now',pos:70,dir:'flat'},
 'Loose carpenter pant':{stage:'Declining',week:32,peak:'passed',pos:82,dir:'down'},
 'Pinafore dress':{stage:'Declining',week:30,peak:'passed',pos:78,dir:'down'}
};
function lifecycleOf(t){return LIFECYCLE[t.name]||{stage:'Emerging',week:10,peak:'Q4 2026',pos:28,dir:'up'};}
const STAGE_COL={Emerging:'var(--cobalt)',Accelerating:'var(--sage)',Peaking:'var(--ochre)',Declining:'var(--clay)'};
// combined recommendation — momentum + brand fit + collection need + saturation + commercial readiness
function recommendTrend(t){
  const l=lifecycleOf(t);
  const inCatalog=(typeof CATALOG!=='undefined')&&CATALOG.some(p=>p.g===t.g&&p.cat===t.cat);
  const momentum={Emerging:1,Accelerating:3,Peaking:2,Declining:0}[l.stage];
  const fit=t.demand.f>=88?3:t.demand.f>=78?2:1;
  const need=inCatalog?1:3;
  const openSupply=t.matches>=14?0:t.matches>=9?1:2;
  const score=momentum+fit+need+openSupply;
  const commercial=t.price<=300?2:1;
  let action,col;
  if(score>=9 && commercial>=2){action='Develop';col='var(--sage)';}
  else if(score>=7){action='Test';col='var(--ochre)';}
  else if(l.stage==='Declining'||score<=3){action='Avoid';col='var(--clay)';}
  else {action='Explore';col='var(--cobalt)';}
  return {action,col,
    momentum:momentum>=3?'High':momentum>=2?'Medium':'Low',
    brand:fit>=3?'High':fit>=2?'Medium':'Low',
    need:need>=3?'High':'Low',
    commercial:commercial>=2?'Ready':'Unproven'};
}
const STAGE_ADVICE={Emerging:'Early — brief a moodboard, hold the buy',Accelerating:'Act now — the buy window is open',Peaking:'At peak — only enter with a fast lead time',Declining:'Too late to start — skip or exit'};

// attribute-level adoption tracking, per gender. each: name, adoption %, YoY direction, brandFit (does it suit Meridian), example garment
const ATTRIBUTES={
 women:{
  Silhouettes:[
   {n:'Bias / fluid column',ad:34,yoy:'+58%',dir:'up',fit:96,g:'dress'},
   {n:'Wide / barrel leg',ad:41,yoy:'+148%',dir:'up',fit:94,g:'trousers'},
   {n:'Drop waist',ad:18,yoy:'+38%',dir:'up',fit:78,g:'skirt'},
   {n:'Oversized shoulder',ad:22,yoy:'−12%',dir:'down',fit:54,g:'blazer'},
   {n:'Cropped / boxy',ad:29,yoy:'−8%',dir:'down',fit:48,g:'coat'},
  ],
  Fabrics:[
   {n:'Sheer / translucent knit',ad:26,yoy:'+212%',dir:'up',fit:92,g:'knit'},
   {n:'Bias satin',ad:31,yoy:'+74%',dir:'up',fit:98,g:'dress'},
   {n:'Washed indigo denim',ad:38,yoy:'+131%',dir:'up',fit:79,g:'trousers'},
   {n:'Technical shell',ad:24,yoy:'−18%',dir:'down',fit:42,g:'coat'},
   {n:'Fine merino',ad:44,yoy:'+22%',dir:'flat',fit:90,g:'knit'},
  ],
  Necklines:[
   {n:'Boat / bateau',ad:28,yoy:'+96%',dir:'up',fit:88,g:'knit'},
   {n:'Cowl',ad:19,yoy:'+44%',dir:'up',fit:82,g:'dress'},
   {n:'High funnel',ad:23,yoy:'+31%',dir:'up',fit:80,g:'knit'},
   {n:'Halter',ad:14,yoy:'−22%',dir:'down',fit:46,g:'dress'},
  ],
 },
 men:{
  Silhouettes:[
   {n:'Unlined soft tailoring',ad:32,yoy:'+96%',dir:'up',fit:90,g:'coat'},
   {n:'Wide pleated trouser',ad:36,yoy:'+78%',dir:'up',fit:86,g:'trousers'},
   {n:'Camp / open collar',ad:27,yoy:'+52%',dir:'up',fit:84,g:'tee'},
   {n:'Heavy outerwear',ad:21,yoy:'−14%',dir:'down',fit:50,g:'coat'},
  ],
  Fabrics:[
   {n:'Fluid wool / merino',ad:34,yoy:'+58%',dir:'up',fit:88,g:'blazer'},
   {n:'Garment-dyed cotton',ad:29,yoy:'+41%',dir:'up',fit:82,g:'tee'},
   {n:'Washed indigo',ad:31,yoy:'+62%',dir:'up',fit:78,g:'trousers'},
   {n:'Technical nylon',ad:18,yoy:'−20%',dir:'down',fit:44,g:'coat'},
  ],
  Necklines:[
   {n:'Open camp collar',ad:30,yoy:'+52%',dir:'up',fit:84,g:'tee'},
   {n:'Crew (heavy gauge)',ad:35,yoy:'+18%',dir:'flat',fit:80,g:'knit'},
   {n:'Funnel zip',ad:16,yoy:'−10%',dir:'down',fit:52,g:'knit'},
  ],
 },
 kids:{
  Silhouettes:[
   {n:'Relaxed / easy fit',ad:38,yoy:'+44%',dir:'up',fit:86,g:'tee'},
   {n:'Pinafore / overall',ad:22,yoy:'+12%',dir:'flat',fit:62,g:'dress'},
   {n:'Boxy tee',ad:30,yoy:'+28%',dir:'up',fit:78,g:'tee'},
  ],
  Fabrics:[
   {n:'Garment-dyed organic cotton',ad:34,yoy:'+41%',dir:'up',fit:84,g:'tee'},
   {n:'Soft jersey',ad:40,yoy:'+18%',dir:'flat',fit:80,g:'tee'},
   {n:'Linen blend',ad:18,yoy:'+22%',dir:'up',fit:70,g:'dress'},
  ],
  Necklines:[
   {n:'Crew',ad:42,yoy:'+8%',dir:'flat',fit:82,g:'tee'},
   {n:'Henley',ad:16,yoy:'+24%',dir:'up',fit:68,g:'tee'},
  ],
 }
};
// color intelligence per gender
const COLOR_TRENDS={
 women:[
  {n:'Bone',h:'#E7E1D3',ad:38,yoy:'+42%',dir:'up',fit:96},
  {n:'Washed indigo',h:'#3C4C68',ad:34,yoy:'+131%',dir:'up',fit:84},
  {n:'Clay',h:'#B07A5B',ad:28,yoy:'+58%',dir:'up',fit:88},
  {n:'Ink',h:'#1B1A14',ad:44,yoy:'+8%',dir:'flat',fit:98},
  {n:'Sage',h:'#8B9079',ad:24,yoy:'+36%',dir:'up',fit:90},
  {n:'Neon lime',h:'#C6F23C',ad:9,yoy:'−40%',dir:'down',fit:12},
 ],
 men:[
  {n:'Char',h:'#4A4944',ad:40,yoy:'+18%',dir:'flat',fit:92},
  {n:'Washed indigo',h:'#3C4C68',ad:32,yoy:'+62%',dir:'up',fit:80},
  {n:'Oat',h:'#CDBFA6',ad:26,yoy:'+44%',dir:'up',fit:84},
  {n:'Ink',h:'#1B1A14',ad:38,yoy:'+6%',dir:'flat',fit:94},
  {n:'Rust',h:'#9C4A2E',ad:18,yoy:'+28%',dir:'up',fit:72},
 ],
 kids:[
  {n:'Sage',h:'#8B9079',ad:34,yoy:'+38%',dir:'up',fit:86},
  {n:'Oat',h:'#CDBFA6',ad:30,yoy:'+22%',dir:'up',fit:82},
  {n:'Clay',h:'#B07A5B',ad:24,yoy:'+30%',dir:'up',fit:78},
  {n:'Bone',h:'#E7E1D3',ad:28,yoy:'+12%',dir:'flat',fit:88},
 ]
};
let radarMode='trends'; // trends | attributes | colors
let radarAttr='Silhouettes';

/* ===== renders ===== */
function renderKPIs(el){el.innerHTML=KPIS.map(k=>`<div class="kpi"><div class="lbl">${k.lbl}</div><div class="val">${k.val}</div><div class="delta ${k.dir}">${k.dir==='up'?'▲':'▼'} ${k.delta}</div><div class="spark">${spark(k.spark,{stroke:k.dir==='down'&&k.lbl.includes('cover')?'var(--clay)':'var(--cobalt)',fill:true})}</div></div>`).join('');}
function renderBrief(){document.getElementById('brief').innerHTML=BRIEF.map(b=>`<div class="brief-item"><span class="brief-tag t-${b.tag}">${b.label}</span><div class="brief-body"><h4>${b.h}</h4><p>${b.p}</p><div class="meta">${b.meta}</div></div><button class="brief-act">${b.act}</button></div>`).join('');}
function renderWinners(){const el=document.getElementById('winners');el.innerHTML=WINNERS.map((w,i)=>`<div style="display:flex;align-items:center;gap:12px;padding:11px 0;${i?'border-top:1px solid var(--hair)':''}"><div style="width:34px;height:42px;border-radius:6px;overflow:hidden">${mtile({color:w.c,fabric:w.f,garmentKey:w.g})}</div><div style="flex:1"><div style="font-weight:600;font-size:13px">${w.n}</div><div class="mono" style="font-size:10px;color:var(--ink-3)">${w.sku}</div></div><div style="width:60px">${spark(w.spark,{w:60,h:24,fill:true})}</div><div class="mono" style="font-weight:600;color:var(--sage);font-size:13px">${w.v}</div></div>`).join('');}

function trendVisible(t){return (mode==='global'||t.brand)&&(gender==='all'||t.gd===gender)&&(!tagFilter||lifecycleOf(t).stage===tagFilter);}
function renderRadarSource(){
  const el=document.getElementById('radarSource');if(!el)return;
  el.innerHTML=`<div class="rsrc-inner">
    <span class="rsrc-live"><span class="rsrc-dot"></span>Crawled this week</span>
    <span class="rsrc-stat"><b>2.4M</b> social posts</span><span class="rsrc-sep">·</span>
    <span class="rsrc-stat"><b>340</b> runway looks</span><span class="rsrc-sep">·</span>
    <span class="rsrc-stat"><b>18</b> competitor sites</span><span class="rsrc-sep">·</span>
    <span class="rsrc-stat"><b>62k</b> resale listings</span>
    <span class="rsrc-upd">updated 4h ago${mode==='brand'?' · filtered to Meridian DNA':''}</span>
  </div>`;
}
function renderPlates(){
  renderRadarSource();
  const fil=document.getElementById('radarFilters');
  // tag filters only make sense in Trends mode
  document.querySelectorAll('#radarFilters .tagf').forEach(b=>b.style.display=radarMode==='trends'?'':'none');
  if(radarMode==='attributes') return renderAttributes();
  if(radarMode==='colors') return renderColorTrends();
  // TRENDS mode
  const body=document.getElementById('radarBody');
  const list=TRENDS.filter(trendVisible).sort((a,b)=>lifecycleOf(a).pos-lifecycleOf(b).pos);
  document.getElementById('trendCount').textContent=list.length+' trends · earliest first';
  // "What changed" — concise, evidence-backed movement summary (observational, not a KPI block)
  const movers=list.slice().sort((a,b)=>b.score-a.score);
  const accel=list.filter(t=>lifecycleOf(t).stage==='Accelerating');
  const declining=list.filter(t=>lifecycleOf(t).stage==='Declining');
  const whatChanged=`<div class="sig-changed"><div class="sc-h">What changed this week</div><ul class="sc-list">
    ${movers[0]?`<li><span class="sc-dot" style="background:var(--sage)"></span><b>${movers[0].name}</b> is the strongest mover — ${signalEvidence(movers[0])[0].toLowerCase()} evidence across sources.</li>`:''}
    ${accel[0]&&accel[0]!==movers[0]?`<li><span class="sc-dot" style="background:var(--cobalt)"></span><b>${accel[0].name}</b> sits in Accelerating — worth evaluating as an opportunity.</li>`:''}
    ${declining[0]?`<li><span class="sc-dot" style="background:var(--clay)"></span><b>${declining[0].name}</b> is past peak and declining — hold.</li>`:''}
  </ul></div>`;
  body.innerHTML=whatChanged+'<div class="plates" id="plates"></div>';
  document.getElementById('plates').innerHTML=list.map((t,i)=>{const added=collection.has(t.name);const lc=lifecycleOf(t);const ev=signalEvidence(t);const esc=s=>s.replace(/'/g,"\\'");
    return `<div class="plate ${added?'added':''}" data-id="${t.name}">
      <div class="figure">${mtile({color:t.col,fabric:t.fabric,garmentKey:t.g,img:photoFor(t.g,t.mood,t.gd)})}
        <span class="idx">${t.gd.toUpperCase()}</span>
        <span class="stage-chip" style="background:${STAGE_COL[lc.stage]}">${lc.stage}</span></div>
      <div class="info"><div class="cat">${t.cat} · ${t.fabric}</div><h4>${t.name}</h4></div>
      <div class="sig-indicators">
        <div class="sig-ind"><span class="si-l">Momentum</span><span class="si-v" style="color:${STAGE_COL[lc.stage]}">${signalMomentum(t)}</span></div>
        <div class="sig-ind"><span class="si-l">Evidence</span><span class="si-v" style="color:${ev[1]}">${ev[0]}</span></div>
      </div>
      <div class="lifecycle">
        <div class="lc-track"><div class="lc-fill" style="width:${lc.pos}%;background:${STAGE_COL[lc.stage]}"></div><span class="lc-marker" style="left:${lc.pos}%;border-color:${STAGE_COL[lc.stage]}"></span>
          <span class="lc-zone" style="left:0">Emerging</span><span class="lc-zone" style="left:33%">Accel.</span><span class="lc-zone" style="left:62%">Peak</span><span class="lc-zone" style="left:86%">Decline</span>
        </div>
        <div class="lc-advice"><span style="color:${STAGE_COL[lc.stage]};font-weight:700">●</span> ${STAGE_ADVICE[lc.stage]} · ${peakWindow(lc)}</div>
      </div>
      <div class="ev-strip">
        <span class="ev-stat up">${t.yoy} YoY</span><span class="ev-dot">·</span>
        <span class="ev-stat">${productsObs(t)} signals</span><span class="ev-dot">·</span>
        <span class="ev-stat" style="color:var(--ink-3)">observed</span></div>
      <div class="foot"><button class="genbtn" onclick="event.stopPropagation();evaluateAsOpp('${esc(t.name)}')">Evaluate as opportunity →</button><button class="openbtn">Evidence</button></div>
    </div>`;}).join('')||`<div class="empty" style="grid-column:1/-1"><div class="ic">○</div><h4>No trends match</h4><p>Loosen the filters or switch back to Global.</p></div>`;
}
// Signals observes; Opportunities decides. "Evaluate" routes to the opportunity view, not straight to generation.
function evaluateAsOpp(name){
  const t=TRENDS.find(x=>x.name===name);
  if(typeof lastHeroForScore!=='undefined')lastHeroForScore=t;
  if(typeof openOpp==='function'){openOpp(name);}
  else{go('whitespace');toast(name+' → evaluate as opportunity');}
}
window.evaluateAsOpp=evaluateAsOpp;
function attrDir(d){return d==='up'?['↑','var(--sage)']:d==='down'?['↓','var(--clay)']:['→','var(--ink-3)'];}
function renderAttributes(){
  const body=document.getElementById('radarBody');
  const seg=gender==='all'?'women':gender;
  const data=ATTRIBUTES[seg];
  document.getElementById('trendCount').textContent=Object.values(data).flat().length+' attributes tracked · '+seg;
  const onBrand=mode==='brand';
  body.innerHTML=`<div class="attr-intro">Every trend broken into the parts your team actually designs — tracked separately so you can see <b>which silhouette, fabric or neckline</b> is moving${onBrand?', filtered to what fits Meridian':''}. ${gender==='all'?'<span style="color:var(--ink-3)">Showing women — switch the segment above for men or kids.</span>':''}<br><span style="color:var(--ink-3);font-size:11px">Adoption = share of observed ${seg}'s products carrying the attribute across the tracked competitor & retailer set, last 90 days. Observed, not forecast.</span></div>
  <div class="attr-cols">${Object.entries(data).map(([group,items])=>{
    let rows=onBrand?items.filter(x=>x.fit>=70):items;
    rows=[...rows].sort((a,b)=>b.ad-a.ad);
    return `<div class="attr-col"><div class="attr-h">${group}</div>${rows.map(x=>{const dr=attrDir(x.dir);const esc=s=>s.replace(/'/g,"\\'");
      return `<div class="attr-row" onclick="radarGenerate('${esc(group)}','${esc(x.n)}','${x.g}')">
        <div class="attr-thumb">${mtile({color:'#9A968B',fabric:'Satin',garmentKey:x.g,img:photoFor(x.g,'Minimal',seg)})}</div>
        <div class="attr-main"><div class="attr-name">${x.n}</div>
          <div class="attr-bar"><span class="ab-track"><i style="width:${x.ad}%;background:${dr[1]==='var(--sage)'?'var(--sage)':dr[1]==='var(--clay)'?'var(--clay)':'var(--cobalt)'}"></i></span><span class="ab-pct">${x.ad}%</span></div>
        </div>
        <div class="attr-meta"><div class="attr-yoy" style="color:${dr[1]}">${dr[0]} ${x.yoy}</div><div class="attr-fit ${x.fit>=80?'hi':x.fit>=60?'md':'lo'}">${x.fit} fit</div></div>
        <button class="attr-gen" title="Design with this" onclick="event.stopPropagation();radarGenerate('${esc(group)}','${esc(x.n)}','${x.g}')">✦</button>
      </div>`;}).join('')}</div>`;}).join('')}</div>`;
}
function renderColorTrends(){
  const body=document.getElementById('radarBody');
  const seg=gender==='all'?'women':gender;
  let cols=COLOR_TRENDS[seg];
  if(mode==='brand')cols=cols.filter(c=>c.fit>=70);
  cols=[...cols].sort((a,b)=>b.ad-a.ad);
  document.getElementById('trendCount').textContent=cols.length+' colours tracked · '+seg;
  const palette=cols.filter(c=>c.fit>=70).slice(0,5);
  body.innerHTML=`<div class="attr-intro">Trending colours for <b>${seg}</b> this season, with adoption and how each sits against Meridian's palette. ${mode==='brand'?'Showing only brand-compatible colours.':'Off-brand colours are flagged low-fit.'}</div>
  <div class="color-rec"><div class="cr-head">Strongest colour signals · ${seg}</div><div class="cr-swatches">${palette.map(c=>`<div class="cr-sw"><span class="cr-chip" style="background:${c.h}"></span><span class="cr-nm">${c.n}</span></div>`).join('')}</div><div class="cr-note">These carry the strongest demand × brand fit <i>in the market</i>. Building them into an actual AW26 palette is a collection decision — <button class="lnk-inline" onclick="go('whitespace2')">do that in Collections →</button></div></div>
  <div class="color-grid">${cols.map(c=>{const dr=attrDir(c.dir);const esc=s=>s.replace(/'/g,"\\'");
    return `<div class="color-card">
      <div class="color-chip" style="background:${c.h}"></div>
      <div class="color-body">
        <div class="color-top"><span class="color-nm">${c.n}</span><span class="color-yoy" style="color:${dr[1]}">${dr[0]} ${c.yoy}</span></div>
        <div class="attr-bar"><span class="ab-track"><i style="width:${c.ad}%;background:${c.h};border:1px solid rgba(0,0,0,.1)"></i></span><span class="ab-pct">${c.ad}%</span></div>
        <div class="color-fit ${c.fit>=70?'hi':'lo'}">${c.fit>=70?'✓ '+c.fit+' brand fit':'✕ off-brand ('+c.fit+')'}</div>
      </div>
    </div>`;}).join('')}</div>`;
}
function radarGenerate(group,name,g){
  // map attribute → studio brief
  const fabricMap={'Sheer / translucent knit':'Rib knit','Bias satin':'Satin','Washed indigo denim':'Denim','Fine merino':'Merino wool','Fluid wool / merino':'Merino wool','Garment-dyed cotton':'Organic cotton','Garment-dyed organic cotton':'Organic cotton','Soft jersey':'Organic cotton','Linen blend':'Linen','Washed indigo':'Denim'};
  go('studio');setStudioPane&&setStudioPane('gen');
  if(typeof gen==='object'){gen.garment=g;gen.fabric=fabricMap[name]||gen.fabric;const di=document.getElementById('dirInput');if(di)di.value=name.toLowerCase()+', on-brand interpretation';syncGenUI&&syncGenUI();}
  goStep&&goStep(1);
  toast('Studio brief set: '+name);
}
window.radarGenerate=radarGenerate;window.renderPlates=renderPlates;
function renderColl(){document.getElementById('collBody').innerHTML=COLL.map(c=>`<tr><td><div class="prod"><div class="thumb">${mtile({color:c.c,fabric:c.f,garmentKey:c.g})}</div><div class="nm">${c.n}<small>${c.sku}</small></div></div></td><td><div style="display:flex;align-items:center;gap:9px"><span class="bar"><i style="width:${c.st}%;background:${c.st>70?'var(--sage)':c.st<30?'var(--clay)':'var(--cobalt)'}"></i></span><span class="mono" style="font-size:11px">${c.st}%</span></div></td><td class="mono" style="font-size:12px">${c.cover}</td><td class="mono" style="font-size:12px">${c.ret}</td><td><span class="tag ${c.sig}">${c.sigt}</span></td></tr>`).join('');}
function renderFuture(){const picked=[...collection];document.getElementById('pinCount').textContent=picked.length+' pinned';const board=document.getElementById('futureBoard');
  if(!picked.length){board.innerHTML=`<div class="empty" style="grid-column:1/-1"><div class="ic"><svg width="22" height="22" viewBox="0 0 24 24" stroke="var(--ink-3)" stroke-width="1.7" fill="none"><path d="M12 5v14M5 12h14"/></svg></div><h4>Nothing pinned yet</h4><p>Add signals from the Signals page or generate styles to start building AW26.</p></div>`;return;}
  board.innerHTML=picked.map((id,i)=>{const t=TRENDS.find(x=>x.name===id)||{g:'dress',cat:'Generated',name:id,col:'#4A4944',fabric:gen.fabric};
    return `<div class="plate" style="cursor:default"><div class="figure">${mtile({color:t.col,fabric:t.fabric,garmentKey:t.g})}<span class="idx">PIN ${String(i+1).padStart(2,'0')}</span></div><div class="info"><div class="cat">${t.cat}${t.fabric?' · '+t.fabric:''}</div><h4>${t.name}</h4></div><div style="height:14px"></div></div>`;}).join('');}
function renderSwatches(){
  document.getElementById('swatches').innerHTML=COLORS.map(c=>`<button class="swpick ${gen.colors.includes(c.h)?'on':''}" title="${c.n}" data-h="${c.h}"><span class="mt-base" style="position:absolute;inset:0;background:${c.h}"></span><span class="tex ${texClass(gen.fabric)}"></span></button>`).join('');
  const dnaEl=document.getElementById('dnaSwatches');if(dnaEl)dnaEl.innerHTML=COLORS.slice(0,6).map((c,i)=>{const f=['Organic cotton','Merino wool','Twill','Satin','Denim','Linen'][i];return `<div style="text-align:center"><div style="width:40px;height:40px;border-radius:8px;overflow:hidden;position:relative;border:1px solid rgba(0,0,0,.1)"><span style="position:absolute;inset:0;background:${c.h}"></span><span class="tex ${texClass(f)}"></span></div><span class="mono" style="font-size:8px;color:var(--ink-3);display:block;margin-top:5px">${c.n}</span></div>`;}).join('');
}
/* BOM panel + guardrail */
function renderBOM(){
  const f=feasibility(gen.category,gen.fabric,gen.colors.length);
  const el=document.getElementById('bom');
  el.className='bom '+(f.pass?'pass':'fail');
  el.innerHTML=`<div class="bh"><span class="t">Production feasibility</span><span class="tag">early estimate</span></div>
    <div class="row"><span class="lk">Construction complexity</span><span class="vv">${f.complexity}</span></div>
    <div class="row"><span class="lk">Fabric · ${gen.fabric}</span><span class="vv">${f.fabricAvail} availability</span></div>
    <div class="row"><span class="lk">Price-band fit</span><span class="vv">${f.bandFit}</span></div>
    <div class="row tot"><span class="lk" style="font-weight:600;color:var(--ink)">Readiness</span><span class="vv" style="color:${f.ready.col};font-weight:700">${f.ready.lbl}</span></div>
    <div class="flag" style="color:${f.ready.col}">${f.note}</div>
    <div class="flag" style="color:var(--ink-3);font-size:10px;border-top:1px solid var(--hair);margin-top:2px;padding-top:8px">Feasibility signal only — not a cost or margin figure. Real costing needs supplier, MOQ and freight data from your systems.</div>`;
  document.getElementById('grFabric').textContent=gen.fabric;
  const gw=document.getElementById('grStatus'),txt=document.getElementById('grStatusTxt');
  const offMood=gen.mood!=='On-brand'&&gen.mood!=='Minimal'&&gen.mood!=='Elevated';
  if(!f.pass){gw.className='gw warn';txt.textContent='Feasibility — review';}
  else if(offMood){gw.className='gw warn';txt.textContent=gen.mood+' drifts from codes';}
  else{gw.className='gw ok';txt.textContent='On-brief';}
}
function renderSpec(){renderBOM();}

/* ===== generation + tech check ===== */
function techCheck(cat,fabric,fit){
  const map={
    Dress:[['Shoulder seams','ok'],['Side seams','ok'],['Centre-back zip','ok'],['Bias hem','satin']],
    Tailoring:[['Set-in sleeves','ok'],['Welt pockets','caution'],['Canvas front','caution'],['Notch lapel','ok']],
    Outerwear:[['Two-piece sleeve','ok'],['Storm flap','ok'],['Bartack stress points','caution'],['Lining bag','ok']],
    Trousers:[['Fly construction','ok'],['Welt back pockets','caution'],['Waistband curtain','ok']],
    Knitwear:[['Raglan join','ok'],['Rib trims','ok'],['Coverstitch hem','ok']],
    Skirt:[['Waistband','ok'],['Invisible zip','ok'],['Back vent','ok']],
    Tee:[['Shoulder taping','ok'],['Coverstitch hem','ok'],['Neck rib','ok']]
  };
  let lines=(map[cat]||map.Tee).map(([n,s])=>{
    let status=s, note='Standard';
    if(s==='satin'){ if(['Satin','Tencel'].includes(fabric)){status='caution';note='Bias slip risk — high-skill seam';} else {status='ok';note='Standard';} }
    if(s==='caution')note='Skilled operation';
    return{n,status,note};
  });
  // structural-impossibility guardrail (the hallucination catcher)
  if(fit==='Oversized'&&cat==='Tailoring')lines.push({n:'Sleeve pitch vs body',status:'flag',note:'Geometry won\u2019t resolve in pattern software — re-draft'});
  if(fabric==='Technical shell'&&['Dress','Skirt'].includes(cat))lines.push({n:'Welded vs sewn seam',status:'flag',note:'Coated shell can\u2019t take this seam — switch closure'});
  const flags=lines.filter(l=>l.status==='flag').length, cautions=lines.filter(l=>l.status==='caution').length;
  const readiness=Math.max(20,100-flags*24-cautions*8);
  return{lines,flags,cautions,readiness};
}
function variantCheckClass(r){return r.flags?'flag':r.cautions?'caut':'pass';}
function variantCheckLabel(r){return r.flags?'Re-draft':r.cautions?'Review':'Pattern-ready';}

function generate(){
  const cols=gen.colors.length?gen.colors:['#1B1A14'];const ids=['A','B','C','D','E','F'];lastVariants=[];
  const out=ids.map((vid,i)=>{const col=cols[i%cols.length];const cname=(COLORS.find(c=>c.h===col)||{}).n||'';
    const check=techCheck(gen.category,gen.fabric,gen.fit);
    const v={vid,col,cname,fabric:gen.fabric,category:gen.category,garment:gen.garment,fit:gen.fit,check};lastVariants.push(v);
    const cc=variantCheckClass(check);
    return `<div class="variant" data-i="${i}"><div class="vf">${mtile({color:col,fabric:gen.fabric,garmentKey:gen.garment,img:photoFor(gen.garment,gen.mood,(gen.gender||'Women').toLowerCase())})}<span class="vtag">VAR ${vid}</span><span class="vcheck ${cc}"><span class="d" style="background:#fff"></span>${variantCheckLabel(check)}</span><span class="vopen">Open tech-pack read</span></div><div class="vmeta"><span>${cname}</span><span>${gen.fit}</span></div></div>`;}).join('');
  document.getElementById('genOut').innerHTML=`<div class="variants">${out}</div>`;
  document.querySelectorAll('#genOut .variant').forEach(v=>v.addEventListener('click',()=>openLedger(lastVariants[+v.dataset.i])));
  toast('6 concepts drafted · '+gen.fabric+' · '+gen.mood);
}

/* ===== drawer infra ===== */
function openDrawer(html){document.getElementById('drawerBody').innerHTML=html;document.getElementById('drawer').classList.add('on');document.getElementById('backdrop').classList.add('on');document.body.style.overflow='hidden';document.getElementById('drawer').scrollTop=0;}
function closeDrawer(){document.getElementById('drawer').classList.remove('on');document.getElementById('backdrop').classList.remove('on');document.body.style.overflow='';}
document.getElementById('drawerClose').addEventListener('click',closeDrawer);
document.getElementById('backdrop').addEventListener('click',closeDrawer);
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer();});

/* ===== opportunity read (SEEN panel) ===== */
function buildOpp(t){
  const moodPctMap={Romantic:38,Minimal:31,Editorial:24,Elevated:22,'On-brand':40};
  const reasons=[
    `Silhouette echoes 3 of your current top sellers`,
    `${t.mood} drives ${moodPctMap[t.mood]||30}% of your revenue`,
    `Your ${t.cat.toLowerCase()} sell-through runs above house average`,
    `${t.fabric} pieces carry one of your highest sell-throughs`
  ];
  const risks=[
    `${t.fabric} can carry higher return rates from fit & length expectations`,
    `A few brands are starting to fill this gap — the window may narrow`,
    `${t.fabric} is less forgiving to produce at small batch sizes`
  ];
  const b=feasibility(t.cat,t.fabric,2);
  const lo=Math.round(t.price*0.9*70/100)*100, hi=Math.round(t.price*1.2*120/100)*100;
  const voices=[
    {h:'@maya.wears',tx:`ISO a ${t.name.toLowerCase()} in a midi length, ideally ${t.fabric.toLowerCase()}. Been looking for months 😩`,m:'Depop · 1,840 similar'},
    {h:'@quietluxe',tx:`why is every ${t.cat.toLowerCase()} so basic right now?? need one that actually feels considered`,m:'TikTok comment · 4.2k likes'},
    {h:'@thrifted.ren',tx:`willing to pay full price for the right one, the resale ones sell out in minutes`,m:'Reddit r/femalefashion'}
  ];
  return{reasons,risks,b,rev:[lo,hi],voices,resemble:[{n:'Camille Midi',se:88,c:'#9C4A2E',f:'Satin',g:'dress'},{n:'Elise Slip',se:81,c:'#CDBFA6',f:'Satin',g:'dress'}]};
}
function openOpp(name){
  const t=TRENDS.find(x=>x.name===name);if(!t)return;const o=buildOpp(t);const added=collection.has(t.name);
  const html=`
    <div class="dr-hero">${mtile({color:t.col,fabric:t.fabric,garmentKey:t.g,img:photoFor(t.g,t.mood,t.gd)})}</div>
    <div class="dr-card">
      <div class="ey">${t.mood} · ${t.cat}</div><h2>${t.name}</h2>
      <div class="why-line" style="color:#cfccbf;margin:-8px 0 16px"><b style="color:#fff">Why now:</b> ${whyFor(t)}</div>
      <div class="oppscore">
        <div class="big">${t.score}<small>OPPORTUNITY</small></div>
        <div>
          <div class="scorerow"><div class="sl">Under-served<br>demand</div><div class="st"><i style="width:${t.demand.d}%;background:var(--ember)"></i></div><div class="sv">${t.demand.d}<span style="color:var(--ember)">↗</span></div></div>
          <div class="scorerow"><div class="sl">Brand fit</div><div class="st"><i style="width:${t.demand.f}%;background:#c98fa0"></i></div><div class="sv">${t.demand.f}<span style="color:var(--ember)">↗</span></div></div>
          <div class="scorerow"><div class="sl">Demand<br>momentum</div><div class="st"><i style="width:${t.demand.m}%;background:#b7b4a6"></i></div><div class="sv">${t.demand.m}<span style="color:var(--ember)">↗</span></div></div>
        </div>
      </div>
      <div class="scorewhy">Score = under-served demand (42%) + brand fit (40%) + open supply (18%). This one indexes high on all three — that's why it ranks where it does.</div>
      <div class="conf"><span class="hi"><span class="d"></span>High confidence</span><span>· based on ${t.signals} signals · freshness: high</span></div>
      <div class="conf" style="margin-top:2px"><span class="src">Jun 19, 2026 · updated hourly · tracked: resale listings, Reddit, search mentions</span></div>
      <button class="rawbtn" id="rawBtn">Raw signals ▾</button>
      <div class="rawtable" id="rawTable">
        <div class="rawrow">Shopper requests in tracked sources (30d) <span class="obs">OBSERVED</span> <span class="rv">${t.signals}</span></div>
        <div class="rawrow">Close matches found <span class="obs">OBSERVED</span> <span class="rv">${t.matches}</span></div>
        <div class="rawrow">Median resale vs est. retail <span class="obs">ESTIMATED</span> <span class="rv">${t.resale}</span></div>
        <div class="rawrow">Demand momentum (90d) <span class="obs">ESTIMATED</span> <span class="rv">${t.yoy}</span></div>
        <div class="rawnote">Observed = found in data we track. Estimated = calculated, not exact. We never claim to see the whole market — only tracked sources.</div>
      </div>
    </div>

    <div class="dr-sec"><div class="sh"><span class="dot" style="background:var(--ember)"></span><h3>Why this fits Meridian</h3></div>
      <div class="resemble">
        <div class="rc"><div class="ph">${mtile({color:t.col,fabric:t.fabric,garmentKey:t.g,img:photoFor(t.g,t.mood,t.gd)})}</div><div class="this">This opportunity</div></div>
        <div class="arrow">↔</div>
        ${o.resemble.map(r=>`<div class="rc"><div class="ph">${mtile({color:r.c,fabric:r.f,garmentKey:r.g,img:photoFor(r.g,'Romantic','women')})}</div><div class="nm">${r.n}</div><div class="se">${r.se}% sell-through</div></div>`).join('')}
      </div>
      <p style="font-size:12px;color:var(--ink-3);font-style:italic;margin:14px 0 0">Your bestsellers it resembles.</p>
      <div style="border-top:1px solid var(--hair);margin-top:16px;padding-top:16px">
        ${attrsFor(t).map(a=>`<div class="attr-row"><span class="al">${a[0]}</span><span class="at"><i style="width:${a[1]}%"></i></span><span class="av">${a[1]}%</span></div>`).join('')}
        <div class="attr-foot">Attribute match drives your <b>${t.demand.f}% brand fit</b> · from your sales data.</div>
      </div>
    </div>

    <div class="dr-sec"><div class="sh"><span class="dot" style="background:var(--ink)"></span><h3>Should you bet on this?</h3></div>
      <div style="color:var(--sage);font-weight:700;font-size:13px;margin-bottom:8px;display:flex;align-items:center;gap:8px"><span style="width:18px;height:18px;border-radius:50%;background:var(--sage);color:#fff;display:grid;place-items:center;font-size:11px">✓</span>Reasons to launch</div>
      ${o.reasons.map(r=>`<div class="reason"><span class="ck" style="color:var(--sage)">✓</span><span>${r}</span></div>`).join('')}
      <div style="color:var(--ochre);font-weight:700;font-size:13px;margin:16px 0 8px;display:flex;align-items:center;gap:8px"><span style="width:18px;height:18px;border-radius:50%;background:var(--ochre);color:#fff;display:grid;place-items:center;font-size:11px">!</span>Why not — the risks</div>
      ${o.risks.map(r=>`<div class="reason risk"><span class="ck" style="color:var(--ochre)">⚠</span><span>${r}</span></div>`).join('')}
      <div class="brandfit">${ring(t.demand.f,'var(--ember)')}<div class="bt"><b>Brand fit ${t.demand.f}%</b> · ${t.mood.toLowerCase()}, minimal<p>A real bet has both sides. You decide.</p></div></div>
    </div>

    <div class="dr-sec"><div class="sh"><span class="dot" style="background:var(--ember)"></span><h3>Sizing the bet</h3><span class="tag" style="background:var(--paper-2);color:var(--ink-2);margin-left:auto">rough estimates</span></div>
      <div class="betrow"><div class="bl">Estimated test revenue<small>range, based on visible demand and plausible capture</small></div><div class="br ember">€${o.rev[0].toLocaleString()}–€${o.rev[1].toLocaleString()}</div></div>
      <div class="betrow"><div class="bl">Producibility<small>${t.fabric} & ${t.cat.toLowerCase()} are in your supplier's range</small></div><div class="br good">${o.b.pass?'In your range':'Needs a capacity check'}</div></div>
      <div class="betrow"><div class="bl">Returns risk<small>your avg for similar pieces</small></div><div class="br ochre">~12%</div></div>
      <div class="betrow"><div class="bl">Suggested test buy<small>small batch to validate before scaling</small></div><div class="br">70–120 units</div></div>
      <p style="font-size:11.5px;color:var(--ink-3);font-style:italic;margin:12px 0 0">Estimates use your historical numbers + demand volume. Directional only — your judgment decides.</p>
    </div>

    <div class="dr-sec"><div class="sh"><span class="dot" style="background:var(--ember)"></span><h3>In their words</h3></div>
      ${o.voices.map(v=>`<div class="voice"><p class="vt"><b>${v.h}</b> ${v.tx}</p><div class="vm">↳ ${v.m}</div></div>`).join('')}
    </div>

    <div class="dr-cta">
      <button class="btn ${added?'ghost':'cobalt'}" id="oppAdd">${added?'✓ In collection':'+ Add to collection'}</button>
      <button class="btn ember" id="oppStudio">Take to Studio →</button>
    </div>`;
  openDrawer(html);
  document.getElementById('rawBtn').addEventListener('click',function(){const rt=document.getElementById('rawTable');const on=rt.classList.toggle('on');this.textContent=on?'Hide raw signals ▴':'Raw signals ▾';});
  document.getElementById('oppAdd').addEventListener('click',function(){if(collection.has(t.name)){collection.delete(t.name);this.className='btn cobalt';this.textContent='+ Add to collection';toast('Removed from collection');}else{collection.add(t.name);this.className='btn ghost';this.textContent='✓ In collection';toast('Added to AW26 collection');}updateCounts();renderPlates();});
  document.getElementById('oppStudio').addEventListener('click',()=>{gen.category=t.cat;gen.garment=t.g;gen.fabric=t.fabric in FAB_COST?t.fabric:'Organic cotton';gen.mood=['On-brand','Romantic','Editorial','Minimal','Elevated'].includes(t.mood)?t.mood:'On-brand';closeDrawer();go('studio');setStudioPane('gen');syncGenUI();toast('Brief loaded into Studio');});
}

/* ===== tech-pack ledger ===== */
function openLedger(v){
  const r=v.check;const b=feasibility(v.category,v.fabric,1);
  const seamColors={ok:'#3F6B4F',caution:'#C8821E',flag:'#B23A2E'};
  // size-run grading (relative, not yardage cost)
  const sizes=gen.sizes.length?gen.sizes:['S','M','L'];const sizeF={XS:'−6%',S:'−3%',M:'base',L:'+4%',XL:'+8%'};
  const yieldCells=sizes.map(s=>`<td>${sizeF[s]||'base'}</td>`).join('');
  const html=`
    <div class="dr-card" style="margin-top:8px">
      <div class="ey" style="color:var(--cobalt)">Tech-pack bridge · VAR ${v.vid}</div>
      <h2 style="font-size:24px;margin-bottom:6px">${v.cname} ${v.category}</h2>
      <div style="font-family:var(--d);font-size:11px;color:#a9a698">${v.fabric} · ${v.fit} fit · grade ${sizes.join(' ')}</div>
      <div class="readiness"><div class="rnum">${r.readiness}</div><div class="rt"><b>Pattern-review flag</b><br>${r.flags?r.flags+' element(s) that need pattern-cutter review before sampling':r.cautions?r.cautions+' high-skill operation(s) to brief the maker':'No flags from these rules — still needs a technical-design pass'}</div></div>
    </div>

    <div class="dr-sec"><div class="sh"><span class="dot" style="background:var(--cobalt)"></span><h3>Construction notes · rule-based, not validated geometry</h3></div>
      <div class="led-map">
        <div class="led-fig">${garment(v.garment,'#16150F')}<span style="position:absolute;bottom:8px;left:0;right:0;text-align:center;font-family:var(--d);font-size:9px;color:var(--ink-3)">indicative</span></div>
        <div class="construct">${r.lines.map(l=>`<div class="cline"><span class="cd" style="background:${seamColors[l.status]}"></span><span class="cn">${l.n}</span><span style="font-family:var(--d);font-size:10px;color:var(--ink-3);margin-right:8px">${l.note}</span><span class="cs ${l.status}">${l.status==='ok'?'OK':l.status==='caution'?'SKILL':'REVIEW'}</span></div>`).join('')}</div>
      </div>
      ${r.flags?`<div style="margin-top:14px;background:var(--clay-wash);color:var(--clay);border-radius:9px;padding:11px 13px;font-size:12.5px"><b>Potential construction conflict:</b> these elements may be hard to execute. Pattern review required before sampling — Atelier isn't validating geometry in CLO or Browzwear, it's flagging from construction rules.</div>`:''}
    </div>

    <div class="dr-sec"><div class="sh"><span class="dot" style="background:var(--ink)"></span><h3>Size grading · considerations, not a spec</h3></div>
      <table class="yield"><thead><tr><th>Size</th>${sizes.map(s=>`<th>${s}</th>`).join('')}</tr></thead>
      <tbody><tr><td>Relative scale</td>${yieldCells}</tr></tbody></table>
      <p style="font-size:11.5px;color:var(--ink-3);margin:10px 0 0">Indicative scaling from your size-curve history. Confirm against the brand's block and fit model before specification — larger sizes may need additional shaping.</p>
    </div>

    <div class="dr-sec"><div class="sh"><span class="dot" style="background:${b.ready.col}"></span><h3>Production feasibility</h3></div>
      <div class="betrow"><div class="bl">Construction complexity</div><div class="br">${b.complexity}</div></div>
      <div class="betrow"><div class="bl">Fabric availability</div><div class="br">${b.fabricAvail}</div></div>
      <div class="betrow"><div class="bl">Readiness</div><div class="br" style="color:${b.ready.col}">${b.ready.lbl}</div></div>
      <div style="margin-top:12px;border-radius:9px;padding:11px 13px;font-size:12px;background:var(--paper);color:var(--ink-2)">${b.note} <b>This is a feasibility signal, not costing</b> — landed cost and margin need supplier, MOQ and freight data from your systems.</div>
    </div>

    <div class="dr-cta">`;
  openLedgerTail(v,v.check,html);
}
function openLedgerTail(v,r,html){
  html+=`
      <button class="btn ghost" onclick="closeDrawer()">Back to concepts</button>
      <button class="btn ${r.flags?'ghost':'ember'}" id="ledExport" ${r.flags?'disabled style="opacity:.5"':''}>${r.flags?'Resolve flags first':'Export AI draft for technical review →'}</button>
    </div>`;
  openDrawer(html);
  const ex=document.getElementById('ledExport');if(ex&&!r.flags)ex.addEventListener('click',()=>{collection.add(v.cname+' '+v.category+' · VAR '+v.vid);updateCounts();toast('AI draft queued for technical review · linked to AW26');closeDrawer();});
}

function renderIntg(){document.getElementById('intg').innerHTML=INTG.map(s=>`<div class="intg-card ${s.linked?'linked':''}"><div class="logo" style="background:${s.c}">${s.init}</div><div><h3>${s.n}</h3><p>${s.d}</p><div class="st">${s.linked?'● ':'○ '}${s.note}</div><button class="cbtn" data-n="${s.n}">${s.linked?'Manage':'Connect'}</button></div></div>`).join('');}
function renderAnalytics(){renderKPIs(document.getElementById('kpis2'));
  document.getElementById('chRev').innerHTML=barchart([{l:'W19',v:58},{l:'W20',v:62},{l:'W21',v:60},{l:'W22',v:71},{l:'W23',v:78},{l:'W24',v:82},{l:'W25',v:96}],{h:170});
  document.getElementById('chMix').innerHTML=donut([{l:'Tailoring',v:34,c:'#1F2BD6'},{l:'Knitwear',v:26,c:'#16150F'},{l:'Dress',v:18,c:'#8B9079'},{l:'Denim',v:14,c:'#B07A5B'},{l:'Outerwear',v:8,c:'#CDBFA6'}]);
  document.getElementById('chTop').innerHTML=barchart([{l:'Trouser',v:920,c:'#1F2BD6'},{l:'Tank',v:840,c:'#1F2BD6'},{l:'Slip',v:610,c:'#16150F'},{l:'Blazer',v:430,c:'#16150F'},{l:'Coat',v:380,c:'#8B9079'},{l:'Shirt',v:150,c:'#B23A2E'}],{h:170});
  document.getElementById('chGeo').innerHTML=`<div style="padding-top:6px">${geobars([{l:'Italy',v:28},{l:'France',v:21},{l:'Germany',v:16},{l:'UK',v:14},{l:'USA',v:12},{l:'Japan',v:9}])}</div>`;}

function updateCounts(){let n=collection.size;let badge=document.getElementById('collCount');const nav=document.querySelector('[data-view="studio"]');
  if(!badge){badge=document.createElement('span');badge.className='count';badge.id='collCount';nav.appendChild(badge);}badge.textContent=n;if(!n)badge.remove();renderFuture();}
let toastT;function toast(m){const t=document.getElementById('toast');document.getElementById('toastMsg').textContent=m;t.classList.add('show');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('show'),2200);}

/* ============================================================
   SURFACE STUDIO — visual surface design (pattern · colour · placement)
   Exclusive job in the platform: the *skin* of a garment.
   Studio = silhouette. Surface Studio = surface. Collections = assortment.
   Honest scope: a styling PREVIEW — patterns sit as an SVG layer over the
   garment silhouette, not UV-mapped to 3D geometry. Labelled as such.
   ============================================================ */

/* ---- region-segmented garments: each part is its own fillable shape ----
   Unlike G[] (single stroke outlines), these are closed polygons per region
   so we can paint pattern/colour into body / sleeves / collar / trim. */
const SS_GARMENTS = {
  blazer: {
    label: 'Blazer', viewBox: '0 0 200 260',
    regions: {
      lsleeve: {name:'L sleeve', d:'M62 64 L40 70 L30 188 L52 192 L66 96 Z'},
      rsleeve: {name:'R sleeve', d:'M138 64 L160 70 L170 188 L148 192 L134 96 Z'},
      body:    {name:'Body',   d:'M62 64 L82 52 L100 70 L118 52 L138 64 L142 226 L104 226 L101 110 L99 110 L96 226 L58 226 Z'},
      lapel:   {name:'Lapel',  d:'M82 52 L100 70 L100 140 L86 96 Z M118 52 L100 70 L100 140 L114 96 Z'},
      collar:  {name:'Collar', d:'M82 52 L100 48 L118 52 L108 62 L100 58 L92 62 Z'}
    },
    order:['lsleeve','rsleeve','body','lapel','collar']
  },
  dress: {
    label: 'Dress', viewBox: '0 0 200 260',
    regions: {
      skirt:  {name:'Skirt',  d:'M80 116 L120 116 L150 240 Q100 252 50 240 Z'},
      bodice: {name:'Bodice', d:'M76 56 L90 48 Q100 54 110 48 L124 56 L122 116 L78 116 Z'},
      lstrap: {name:'L strap', d:'M76 56 L82 58 L88 40 L82 38 Z'},
      rstrap: {name:'R strap', d:'M124 56 L118 58 L112 40 L118 38 Z'},
      neck:   {name:'Neckline', d:'M90 48 Q100 60 110 48 L108 44 Q100 52 92 44 Z'}
    },
    order:['skirt','bodice','lstrap','rstrap','neck']
  },
  knit: {
    label: 'Knit', viewBox: '0 0 200 260',
    regions: {
      lsleeve: {name:'L sleeve', d:'M58 60 L36 76 L30 150 L50 156 L64 96 Z'},
      rsleeve: {name:'R sleeve', d:'M142 60 L164 76 L170 150 L150 156 L136 96 Z'},
      body:    {name:'Body',   d:'M58 60 L84 50 Q100 58 116 50 L142 60 L140 224 L60 224 Z'},
      collar:  {name:'Collar', d:'M84 50 Q100 64 116 50 L112 44 Q100 54 88 44 Z'}
    },
    order:['lsleeve','rsleeve','body','collar']
  },
  trousers: {
    label: 'Trousers', viewBox: '0 0 200 260',
    regions: {
      waist: {name:'Waist',  d:'M64 44 L136 44 L134 70 L66 70 Z'},
      lleg:  {name:'L leg',  d:'M66 70 L99 70 L97 240 L74 240 L70 130 Z'},
      rleg:  {name:'R leg',  d:'M101 70 L134 70 L130 130 L126 240 L103 240 Z'}
    },
    order:['waist','lleg','rleg']
  },
  coat: {
    label: 'Coat', viewBox: '0 0 200 260',
    regions: {
      lsleeve: {name:'L sleeve', d:'M58 58 L34 74 L28 206 L50 212 L64 96 Z'},
      rsleeve: {name:'R sleeve', d:'M142 58 L166 74 L172 206 L150 212 L136 96 Z'},
      body:    {name:'Body',   d:'M58 58 L84 46 L100 64 L116 46 L142 58 L148 244 L104 244 L102 110 L98 110 L96 244 L52 244 Z'},
      placket: {name:'Placket', d:'M96 64 L104 64 L104 244 L96 244 Z'},
      collar:  {name:'Collar', d:'M82 46 L100 42 L118 46 L108 58 L100 54 L92 58 Z'}
    },
    order:['lsleeve','rsleeve','body','placket','collar']
  }
};

/* ---- pattern generators: SVG <pattern> built live, fully recolorable + scalable ----
   Each returns the inner markup of a <pattern>; recolor via fg/bg, scale via tile size. */
/* ---- pattern generators with per-pattern param support ---- */
const SS_PATTERNS = {
  solid:  {name:'Solid', params:[], make:(p,s)=>``},
  stripe: {name:'Stripe',params:['width','gap','rot2'],
    make:(p,s)=>{const w=p.width||s*.38,g=p.gap||s*.62,r=p.rot2||0;
      return `<rect width="${s}" height="${s}" fill="${p.bg||'#fff'}"/><rect width="${w}" height="${s}" fill="${p.fg||'#000'}"/>`;
    }},
  check:  {name:'Check', params:['weight'],
    make:(p,s)=>{const h=s/2;return `<rect width="${s}" height="${s}" fill="${p.bg||'#fff'}"/><rect width="${h}" height="${h}" fill="${p.fg||'#000'}"/><rect x="${h}" y="${h}" width="${h}" height="${h}" fill="${p.fg||'#000'}"/>`;
    }},
  dot:    {name:'Dot',   params:['size','density'],
    make:(p,s)=>{const r=s*(p.size||.18),d=p.density||1,h=s/2;let out=`<rect width="${s}" height="${s}" fill="${p.bg||'#fff'}"/>`;
      if(d>1){out+=`<circle cx="${s*.25}" cy="${s*.25}" r="${r*.65}" fill="${p.fg||'#000'}" opacity=".6"/>`;out+=`<circle cx="${s*.75}" cy="${s*.75}" r="${r*.65}" fill="${p.fg||'#000'}" opacity=".6"`+'/>'}
      return out+`<circle cx="${h}" cy="${h}" r="${r}" fill="${p.fg||'#000'}"/>`;
    }},
  geo:    {name:'Geo',   params:['form'],
    make:(p,s)=>{const f=p.form||'diamond',h=s/2;
      const shape=f==='triangle'?`<path d="M${h} ${s*.1} L${s*.9} ${s*.9} L${s*.1} ${s*.9} Z" fill="${p.fg||'#000'}"/>`:f==='hex'?`<path d="M${h} ${s*.08} L${s*.88} ${s*.31} L${s*.88} ${s*.69} L${h} ${s*.92} L${s*.12} ${s*.69} L${s*.12} ${s*.31} Z" fill="${p.fg||'#000'}" fill-opacity=".8"/>`:
        `<path d="M${h} ${s*.1} L${s*.9} ${h} L${h} ${s*.9} L${s*.1} ${h} Z" fill="${p.fg||'#000'}"/>`;
      return `<rect width="${s}" height="${s}" fill="${p.bg||'#fff'}"/>${shape}`;
    }},
  floral: {name:'Floral',params:['motifScale','density','petals'],
    make:(p,s)=>{const c=s/2,sc=p.motifScale||1,r=s/7*sc,pets=p.petals||5,step=360/pets;
      let out=`<rect width="${s}" height="${s}" fill="${p.bg||'#fff'}"/>`;
      if(p.density>1){for(let a=0;a<360;a+=step*2){const x=s*.2+Math.cos(a*Math.PI/180)*s*.18,y=s*.2+Math.sin(a*Math.PI/180)*s*.18;out+=`<circle cx="${x}" cy="${y}" r="${r*.5}" fill="${p.fg||'#000'}" opacity="0.35"/>`;}}
      for(let a=0;a<360;a+=step){const x=c+Math.cos(a*Math.PI/180)*r*1.5,y=c+Math.sin(a*Math.PI/180)*r*1.5;out+=`<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r*.65}" transform="rotate(${a},${x},${y})" fill="${p.fg||'#000'}" opacity="0.88"/>`;}
      return out+`<circle cx="${c}" cy="${c}" r="${r*.7}" fill="${p.bg||'#fff'}"/>`;
    }},
  herringbone:{name:'Herring',params:['weight'],
    make:(p,s)=>{const w=s*(p.weight||.12),h=s/2;
      return `<rect width="${s}" height="${s}" fill="${p.bg||'#fff'}"/><path d="M0 ${h} L${h} 0 M${h} ${s} L${s} ${h}" stroke="${p.fg||'#000'}" stroke-width="${w}" fill="none"/><path d="M0 ${h} L${h} ${s} M${h} 0 L${s} ${h}" stroke="${p.fg||'#000'}" stroke-width="${w*.6}" fill="none" opacity=".5"/>`;
    }},
  pinstripe:{name:'Pin',  params:['spacing'],
    make:(p,s)=>{const sp=p.spacing||s*.12;return `<rect width="${s}" height="${s}" fill="${p.bg||'#fff'}"/><line x1="${sp}" y1="0" x2="${sp}" y2="${s}" stroke="${p.fg||'#000'}" stroke-width="1"/>`;
    }}
};

/* ---- state with layers, symmetry, versions, view ---- */
const ssState = {
  garment:'blazer', sel:null, view:'front',
  surfaces:{},        // per-region: {layers:[{type,pattern,params,fg,bg}], linked, note}
  versions:[],        // [{name, surfaces snapshot, garment}]
  ai:{loading:false,lastPrompt:''},
  base:'#9A968B'
};

const SS_LINK_PAIRS = {blazer:{'lsleeve':'rsleeve'},knit:{'lsleeve':'rsleeve'},coat:{'lsleeve':'rsleeve'}};

function ssInit(){
  const g=SS_GARMENTS[ssState.garment];
  ssState.surfaces={};
  Object.keys(g.regions).forEach(k=>{
    ssState.surfaces[k]={
      layers:[{type:'base',pattern:'solid',params:{fg:'#1B1A14',bg:ssState.base},fg:'#1B1A14',bg:ssState.base}],
      linked:false, note:''
    };
  });
  // link symmetric pairs by default
  const pairs=SS_LINK_PAIRS[ssState.garment]||{};
  Object.entries(pairs).forEach(([a,b])=>{if(ssState.surfaces[a]&&ssState.surfaces[b])ssState.surfaces[a].linked=true;});
  ssState.sel=Object.keys(g.regions).find(k=>k==='body')||Object.keys(g.regions)[0];
  ssState.view='front';
}

/* ---- layer helpers ---- */
function ssActiveSurface(){ return ssState.surfaces[ssState.sel]; }
function ssActiveLayer(){ const su=ssActiveSurface(); return su?su.layers[0]:null; }
function ssPatMake(k,p,s){
  const pat=SS_PATTERNS[k];if(!pat)return '';
  const full={...p,fg:p.fg||'#1B1A14',bg:p.bg||ssState.base};
  return pat.make(full,s);
}
function ssRegionFill(k){
  const su=ssState.surfaces[k];if(!su)return ssState.base;
  const l=su.layers[0];
  if(l.pattern==='solid')return l.params.bg||l.bg||ssState.base;
  return `url(#ssp-${k})`;
}
function ssPatternDefs(){
  const g=SS_GARMENTS[ssState.garment];let defs='';
  Object.keys(g.regions).forEach(k=>{
    const su=ssState.surfaces[k];if(!su)return;
    const l=su.layers[0];if(l.pattern==='solid')return;
    const s=l.params.scale||18;
    const inner=ssPatMake(l.pattern,{...l.params,fg:l.params.fg||l.fg||'#1B1A14',bg:l.params.bg||l.bg||ssState.base},s);
    defs+=`<pattern id="ssp-${k}" patternUnits="userSpaceOnUse" width="${s}" height="${s}" patternTransform="rotate(${l.params.rotate||0})">${inner}</pattern>`;
  });
  return defs;
}

/* ---- SVG garment ---- */
function ssGarmentSVG(opts){
  opts=opts||{};
  const g=SS_GARMENTS[ssState.garment];
  const interactive=opts.interactive!==false;
  const back=ssState.view==='back';
  let svg=`<svg viewBox="${g.viewBox}" class="ss-svg" preserveAspectRatio="xMidYMid meet"><defs>${ssPatternDefs()}</defs>`;
  // back view: flip horizontally via transform
  if(back) svg=`<svg viewBox="${g.viewBox}" class="ss-svg" preserveAspectRatio="xMidYMid meet"><defs>${ssPatternDefs()}</defs><g transform="translate(200,0) scale(-1,1)">`;
  g.order.forEach(k=>{
    const r=g.regions[k];
    const su=ssState.surfaces[k];
    const selCls=(interactive&&ssState.sel===k)?'ss-region sel':'ss-region';
    const linkedPairs=SS_LINK_PAIRS[ssState.garment]||{};
    const isLinked=su&&su.linked&&(linkedPairs[k]||Object.values(linkedPairs).includes(k));
    const linkedDot=isLinked?`<circle cx="8" cy="8" r="4" fill="var(--cobalt)" opacity=".7"/>`:''
    const click=interactive?`onclick="ssSelectRegion('${k}')"`:'';
    svg+=`<path class="${selCls}" d="${r.d}" fill="${ssRegionFill(k)}" stroke="#16150F" stroke-width="1" stroke-opacity="${ssState.sel===k?.45:.2}" ${click}/>`;
  });
  if(back) svg+=`</g>`;
  svg+=`</svg>`;
  return svg;
}

/* ---- colourway engine ---- */
function ssColorways(){
  return COLORS.slice(0,4).map(c=>({base:c.h,name:c.n,fg:ssContrast(c.h)}));
}
function ssContrast(hex){const n=parseInt(hex.slice(1),16),L=((n>>16)*0.299+((n>>8)&255)*0.587+(n&255)*0.114);return L>140?'#16150F':'#E7E1D3';}
function ssColorwaySVG(cw){
  const g=SS_GARMENTS[ssState.garment];
  let defs='',paths='';
  g.order.forEach(k=>{
    const su=ssState.surfaces[k];if(!su)return;
    const l=su.layers[0],r=g.regions[k];
    let fill;
    if(l.pattern==='solid'){fill=cw.base;}
    else{const s=l.params.scale||18;const pid='cwp-'+cw.name.replace(/\s/g,'')+'-'+k;
      defs+=`<pattern id="${pid}" patternUnits="userSpaceOnUse" width="${s}" height="${s}" patternTransform="rotate(${l.params.rotate||0})">${ssPatMake(l.pattern,{...l.params,fg:cw.fg,bg:cw.base},s)}</pattern>`;
      fill=`url(#${pid})`;}
    paths+=`<path d="${r.d}" fill="${fill}" stroke="#16150F" stroke-width="1" stroke-opacity="0.18"/>`;
  });
  return `<svg viewBox="${g.viewBox}" class="ss-cw-svg"><defs>${defs}</defs>${paths}</svg>`;
}

/* ---- per-pattern control panels ---- */
function ssParamControls(l){
  const p=l.params;const pat=l.pattern;
  if(pat==='solid')return '';
  let html='';
  const sl=(key,label,min,max,val,fmt)=>`<div class="ss-slider"><label>${label}<span class="ss-val">${fmt?fmt(val):val}</span></label><input type="range" min="${min}" max="${max}" value="${val}" oninput="ssSetParam('${key}',+this.value)"></div>`;
  if(pat==='stripe') html+=sl('width','Stripe width',2,s=>s*.8,p.width||8,v=>v+'px')+sl('gap','Gap',1,16,p.gap||6,v=>v+'px');
  if(pat==='check') html+=sl('scale','Scale',8,44,p.scale||18,v=>v+'px');
  if(pat==='dot') html+=sl('size','Dot size',.08,.38,p.size||.18,v=>Math.round(v*100)+'%')+sl('density','Density',1,3,p.density||1,v=>['single','double','dense'][v-1]||v);
  if(pat==='geo') html+=`<div class="ss-grp"><div class="ss-grp-h">Form</div><div class="ss-opts">${['diamond','triangle','hex'].map(f=>`<button class="ss-opt ${(p.form||'diamond')===f?'on':''}" onclick="ssSetParam('form','${f}')">${f.charAt(0).toUpperCase()+f.slice(1)}</button>`).join('')}</div></div>`;
  if(pat==='floral') html+=sl('motifScale','Motif scale',.5,2,p.motifScale||1,v=>v+'×')+sl('petals','Petals',4,8,p.petals||5)+sl('density','Density',1,2,p.density||1,v=>v>1?'scattered':'single');
  if(pat==='herringbone'||pat==='pinstripe') html+=sl('weight','Weight',.04,.22,p.weight||.12,v=>Math.round(v*100)+'%');
  html+=sl('scale','Tile size',8,52,p.scale||18,v=>v+'px');
  html+=sl('rotate','Rotation',0,90,p.rotate||0,v=>v+'°');
  return html;
}

/* ---- apply / link helpers ---- */
function ssSelectRegion(k){
  ssState.sel=k;ssRender();
}
function ssSetGarment(gk){ssState.garment=gk;ssInit();ssRender();}
function ssSetPattern(pat){
  const su=ssActiveSurface();if(!su)return;
  const old=su.layers[0];
  su.layers[0]={...old,pattern:pat,params:{...old.params,scale:old.params.scale||18,rotate:old.params.rotate||0}};
  ssSyncLinked(ssState.sel);ssRender();
}
function ssSetBg(c){
  const su=ssActiveSurface();if(!su)return;
  su.layers[0].params.bg=c;su.layers[0].bg=c;
  ssSyncLinked(ssState.sel);ssRender();
}
function ssSetFg(c){
  const su=ssActiveSurface();if(!su)return;
  su.layers[0].params.fg=c;su.layers[0].fg=c;
  ssSyncLinked(ssState.sel);ssRender();
}
function ssSetParam(key,val){
  const su=ssActiveSurface();if(!su)return;
  su.layers[0].params[key]=val;
  ssSyncLinked(ssState.sel);ssRender();
}
function ssToggleLink(k){
  const su=ssState.surfaces[k];if(!su)return;
  su.linked=!su.linked;
  const pairs=SS_LINK_PAIRS[ssState.garment]||{};
  const partner=pairs[k]||Object.keys(pairs).find(a=>pairs[a]===k);
  if(partner&&ssState.surfaces[partner]) ssState.surfaces[partner].linked=su.linked;
  if(su.linked) ssSyncLinked(k);ssRender();
}
function ssSyncLinked(k){
  const pairs=SS_LINK_PAIRS[ssState.garment]||{};
  const partner=pairs[k]||Object.keys(pairs).find(a=>pairs[a]===k);
  const su=ssState.surfaces[k];
  if(!su||!su.linked||!partner||!ssState.surfaces[partner])return;
  ssState.surfaces[partner].layers=JSON.parse(JSON.stringify(su.layers));
}
function ssApplyToAll(scope){
  const su=ssActiveSurface();if(!su)return;
  const g=SS_GARMENTS[ssState.garment];
  Object.keys(g.regions).forEach(k=>{
    if(k===ssState.sel)return;
    if(scope==='sleeves'&&!k.includes('sleeve'))return;
    if(scope==='body'&&k.includes('sleeve')&&k!=='body')return;
    ssState.surfaces[k].layers=JSON.parse(JSON.stringify(su.layers));
  });
  closeDrawer&&closeDrawer();ssRender();ssToast('Applied to '+scope);
}
function ssToggleView(){ssState.view=ssState.view==='front'?'back':'front';ssRender();}

/* ---- versions ---- */
function ssSaveVersion(name){
  if(ssState.versions.length>=4)ssState.versions.shift();
  ssState.versions.push({name:name||'V'+(ssState.versions.length+1),garment:ssState.garment,surfaces:JSON.parse(JSON.stringify(ssState.surfaces)),ts:Date.now()});
  ssRender();ssToast('Saved version: '+(name||'V'+(ssState.versions.length)));
}
function ssLoadVersion(i){
  const v=ssState.versions[i];if(!v)return;
  ssState.garment=v.garment;ssState.surfaces=JSON.parse(JSON.stringify(v.surfaces));ssRender();ssToast('Loaded '+v.name);
}

/* ---- brand guardrails ---- */
function ssGuardrailCheck(pat,fg,bg){
  if(pat==='floral'){return {warn:true,msg:'High-detail florals fall outside Meridian restrained surface language. Continue as an intentional exploration?'};}
  const bright=c=>{const n=parseInt((c||'#888').slice(1),16);return ((n>>16)*0.299+((n>>8)&255)*0.587+(n&255)*0.114)>180;};
  if(bright(fg)&&bright(bg))return {warn:true,msg:'Both colours read as light — low contrast may conflict with Meridian tonal restraint.'};
  return {warn:false,msg:''};
}

/* ---- AI surface generation ---- */
async function ssAIGenerate(prompt){
  if(!prompt.trim()){ssToast('Describe the surface you want');return;}
  ssState.ai.loading=true;ssState.ai.lastPrompt=prompt;ssRender();
  try{
    const garmentLabel=SS_GARMENTS[ssState.garment].label;
    const regionNames=Object.values(SS_GARMENTS[ssState.garment].regions).map(r=>r.name).join(', ');
    const colorNames=COLORS.map(c=>c.n).join(', ');
    const patternNames=Object.values(SS_PATTERNS).map(p=>p.name).join(', ');
    const systemPrompt=`You are a senior fashion surface designer at ${DNA_CORE?.brand||'Meridian'}, a quiet, tonal, architectural contemporary brand.
Your job: translate a surface design brief into a structured specification.

Garment: ${garmentLabel}
Regions available: ${regionNames}
Colour palette: ${colorNames}
Pattern types: ${patternNames}

Respond ONLY with a JSON object, no markdown, no preamble:
{
  "title": "short design name",
  "intent": "one sentence design rationale",
  "guardrail": null or "warning message if off-brand",
  "regions": {
    "<region_name_lowercase_no_space>": {
      "pattern": "<one of: solid stripe check dot geo floral herringbone pinstripe>",
      "bg": "<hex from the palette or similar tonal hex>",
      "fg": "<hex for motif if patterned>",
      "scale": <number 8-44>,
      "rotate": <0-90>
    }
  }
}

Brand DNA: restrained, tonal, architectural. Favour solids, pinstripes, fine checks, tonal dots. Avoid high-saturation colour or dense florals unless explicitly requested. If the user asks for something off-brand, fulfil it but set a guardrail message.`;
    const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:1000,system:systemPrompt,messages:[{role:'user',content:prompt}]})});
    const data=await res.json();
    const raw=data.content?.[0]?.text||'{}';
    let spec;
    try{spec=JSON.parse(raw.replace(/```json|```/g,'').trim());}catch(e){ssToast('Could not parse AI response');ssState.ai.loading=false;ssRender();return;}
    // apply the spec to regions
    const g=SS_GARMENTS[ssState.garment];
    if(spec.regions){
      Object.entries(spec.regions).forEach(([rk,rs])=>{
        // fuzzy match region key
        const match=Object.keys(g.regions).find(k=>k===rk||k.replace(/\s/g,'')===rk||g.regions[k].name.toLowerCase().replace(/\s/g,'')===rk.toLowerCase().replace(/\s/g,''));
        if(!match)return;
        ssState.surfaces[match].layers[0]={pattern:rs.pattern||'solid',params:{fg:rs.fg||'#1B1A14',bg:rs.bg||ssState.base,scale:rs.scale||18,rotate:rs.rotate||0,motifScale:1,density:1,petals:5,form:'diamond',weight:.12},fg:rs.fg||'#1B1A14',bg:rs.bg||ssState.base};
      });
    }
    ssState.ai.result={title:spec.title,intent:spec.intent,guardrail:spec.guardrail};
    ssState.ai.loading=false;ssRender();
    if(spec.guardrail) ssToast('Brand note: '+spec.guardrail);
    else ssToast(spec.title||'Surface generated');
  }catch(e){ssToast('Generation failed');ssState.ai.loading=false;ssRender();}
}

/* ---- main render ---- */
function renderSurfaceStudio(){
  if(!ssState.surfaces||!Object.keys(ssState.surfaces).length)ssInit();
  const g=SS_GARMENTS[ssState.garment];
  const su=ssActiveSurface();
  const l=ssActiveLayer();
  const pairs=SS_LINK_PAIRS[ssState.garment]||{};
  const partner=pairs[ssState.sel]||Object.keys(pairs).find(a=>pairs[a]===ssState.sel);
  const isLinked=su&&su.linked;
  const guardrail=l?ssGuardrailCheck(l.pattern,l.params.fg,l.params.bg):{warn:false};
  const hasVersions=ssState.versions.length>0;
  const host=document.getElementById('view-surface');
  // garment photo for realistic canvas
  const gPhoto={blazer:IMG.tailor,dress:IMG.slip,knit:IMG.knit,trousers:IMG.mentrouser,coat:IMG.tailor};
  const photo=gPhoto[ssState.garment]||IMG.tailor;
  // task modes
  const TASKS=['Recolour','Apply print','Generate print','Add finish','Edit region'];
  const task=ssState.task||'Recolour';
  host.innerHTML=`
  <div class="ss-pro-wrap">
    <div class="ss-pro-header">
      <div><div class="eyebrow">Surface Studio · ${g.label}</div>
        <div class="ss-pro-context">AW26 Main · Design Studio concept · Direction B <span class="ss-pro-v">Draft</span></div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${hasVersions?`<div class="ss-versions">${ssState.versions.map((v,i)=>`<button class="ss-vbtn" onclick="ssLoadVersion(${i})">${v.name}</button>`).join('')}</div>`:''}
        <button class="btn ghost" onclick="ssSaveVersion('')">Save version</button>
        <button class="btn ghost" onclick="ssOpenCompare()">Compare</button>
        <button class="btn" onclick="ssExport()">Export spec</button>
      </div>
    </div>

    ${guardrail.warn?`<div class="ss-guardrail"><span>⚠ Brand note:</span> ${guardrail.msg} <button class="link" onclick="this.parentElement.remove()">Continue as exploration</button></div>`:''}
    ${ssState.ai.result?`<div class="ss-ai-result"><span class="ss-ai-title">${ssState.ai.result.title}</span><span class="ss-ai-intent">${ssState.ai.result.intent}</span>${ssState.ai.result.guardrail?`<span class="ss-ai-warn">⚠ ${ssState.ai.result.guardrail}</span>`:''}</div>`:''}

    <div class="ss-pro-layout">

      <!-- LEFT: source panel -->
      <div class="ss-source-panel">
        <div class="ss-src-h">Surface source</div>
        <div class="ss-src-tabs">
          ${['Generate','Library','Upload'].map(t=>`<button class="ss-src-tab ${(ssState.srcTab||'Generate')===t?'on':''}" onclick="ssState.srcTab='${t}';ssRender()">${t}</button>`).join('')}
        </div>
        ${(ssState.srcTab||'Generate')==='Generate'?`
          <div class="ss-ai-area">
            <div class="ss-task-modes">${TASKS.map(t=>`<button class="ss-task ${task===t?'on':''}" onclick="ssState.task='${t}';ssRender()">${t}</button>`).join('')}</div>
            <div class="ss-src-label">Editing · <b>${g.regions[ssState.sel]?.name||''}</b></div>
            <textarea class="ss-ai-ta" id="ssAiInput" rows="4" placeholder="Describe what you want — e.g. &quot;Tonal hand-painted botanical, sparse placement, Ink and muted Ochre. Preserve the lapels, sleeves and silhouette.&quot;">${ssState.ai.lastPrompt}</textarea>
            <div class="ss-preserve-grid">
              <div class="ss-pres-h">Preserve</div>
              ${['Silhouette','Garment details','Lighting','Model','Background'].map(p=>`<label class="ss-pres-row"><input type="checkbox" checked onclick="void 0"><span>${p}</span></label>`).join('')}
            </div>
            <button class="btn ss-gen-btn ${ssState.ai.loading?'ghost':''}" onclick="ssAIGenerate(document.getElementById('ssAiInput').value)" ${ssState.ai.loading?'disabled':''}>${ssState.ai.loading?'<span class="ss-spin">⟳</span> Generating…':'✦ Generate'}</button>
          </div>`:(ssState.srcTab==='Library')?`
          <div class="ss-lib">
            <div class="ss-src-label">Quick-start patterns</div>
            <div class="ss-lib-grid">${Object.entries(SS_PATTERNS).map(([k,p])=>`<button class="ss-lib-item ${l?.pattern===k?'on':''}" onclick="ssSetPattern('${k}')"><span class="ss-pat-sw" style="width:100%;height:40px;display:block">${ssPatPreview(k,l||{})}</span><span style="font-size:10px">${p.name}</span></button>`).join('')}</div>
            <div class="ss-src-label" style="margin-top:14px">Brand archive</div>
            <div class="ss-archive-note">AW25 surface treatments · SS25 colourways · Historical prints<br><button class="link">Connect brand archive →</button></div>
          </div>`:
          `<div class="ss-upload-area" onclick="ssToast('Upload artwork, repeat tile, textile scan or supplier swatch')">
            <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" fill="none" width="28" height="28"><path d="M12 19V5M5 12l7-7 7 7"/><rect x="3" y="19" width="18" height="2" rx="1" opacity=".4"/></svg>
            <div>Drop artwork here</div>
            <div style="font-size:11px;color:var(--ink-3)">Repeat tile · textile scan · supplier swatch · reference image</div>
          </div>`
        }
      </div>

      <!-- CENTRE: canvas -->
      <div class="ss-canvas-col">
        <div class="ss-canvas-tools">
          <div class="ss-garment-tabs">${Object.entries(SS_GARMENTS).map(([k,gg])=>`<button class="ss-gt ${k===ssState.garment?'on':''}" onclick="ssSetGarment('${k}')">${gg.label}</button>`).join('')}</div>
          <div style="display:flex;gap:6px">
            <button class="ss-view-btn ${ssState.view==='front'?'on':''}" onclick="ssState.view='front';ssRender()">Front</button>
            <button class="ss-view-btn ${ssState.view==='back'?'on':''}" onclick="ssState.view='back';ssRender()">Back</button>
          </div>
        </div>

        <div class="ss-pro-canvas">
          <!-- realistic garment photo (the AI editing target) -->
          <img class="ss-photo" src="${photo}" alt="${g.label}" onerror="this.style.display='none'">
          <!-- SVG mask overlay for region selection — sits over the photo -->
          <div class="ss-mask-overlay">${ssGarmentSVG()}</div>
          <!-- AI render state indicator -->
          <div class="ss-render-state">
            ${ssState.ai.loading?`<div class="ss-render-loading"><span class="ss-spin">⟳</span> AI generating surface treatment…</div>`:
              ssState.ai.result?`<div class="ss-render-ready">✓ Surface spec generated · <span style="color:var(--ink-3);font-size:10px">Photo-realistic render requires image-gen API integration</span></div>`:
              `<div class="ss-render-hint">Select a region → generate or apply a surface treatment</div>`}
          </div>
        </div>

        <div class="ss-region-pills">${g.order.slice().reverse().map(k=>{const lk=!!(pairs[k]||Object.keys(pairs).find(a=>pairs[a]===k));return `<button class="ss-rp ${k===ssState.sel?'on':''}" onclick="ssSelectRegion('${k}')">${g.regions[k].name}${lk&&ssState.surfaces[k]&&ssState.surfaces[k].linked?'<span class="ss-link-dot"></span>':''}</button>`;}).join('')}</div>

        <!-- variant tray -->
        ${hasVersions?`<div class="ss-variant-tray">
          <div class="ss-vt-h">Saved versions</div>
          <div class="ss-vt-row">${ssState.versions.map((v,i)=>`<div class="ss-vt-item ${i===ssState.activeVersion?'on':''}" onclick="ssLoadVersion(${i})"><div class="ss-vt-img">${ssColorwaySVG({base:COLORS[i%COLORS.length].h,name:v.name,fg:ssContrast(COLORS[i%COLORS.length].h)})}</div><div class="ss-vt-n">${v.name}</div></div>`).join('')}
          </div></div>`:''}
      </div>

      <!-- RIGHT: inspector -->
      <div class="ss-inspector">
        <div class="ss-insp-h">Region · <b>${g.regions[ssState.sel]?.name||''}</b></div>
        ${partner?`<button class="ss-link-btn ${isLinked?'on':''}" onclick="ssToggleLink('${ssState.sel}')" style="margin-bottom:12px">${isLinked?'⟷ Linked to partner':'Link ↔ partner'}</button>`:''}

        <div class="ss-grp"><div class="ss-grp-h">Colour</div>
          <div class="ss-col-row"><span class="ss-col-l">${l?.pattern==='solid'?'Fill':'Ground'}</span><div class="ss-swatches">${COLORS.map(c=>`<button class="ss-sw ${l?.params?.bg===c.h?'on':''}" style="background:${c.h}" title="${c.n}" onclick="ssSetBg('${c.h}')"></button>`).join('')}</div></div>
          ${l?.pattern!=='solid'?`<div class="ss-col-row"><span class="ss-col-l">Motif</span><div class="ss-swatches">${COLORS.map(c=>`<button class="ss-sw ${l?.params?.fg===c.h?'on':''}" style="background:${c.h}" title="${c.n}" onclick="ssSetFg('${c.h}')"></button>`).join('')}</div></div>`:''}
          <div class="ss-colname">${l?colNameSS(l.params?.bg||l.bg||ssState.base):''}</div>
        </div>

        ${l&&l.pattern!=='solid'?`<div class="ss-grp"><div class="ss-grp-h">Pattern controls</div>${ssParamControls(l)}</div>`:''}

        <div class="ss-grp">
          <button class="btn ghost ss-applyall" style="width:100%" onclick="openDrawer(ssApplyDialog())">Apply to…</button>
        </div>

        <!-- AW26 context card -->
        <div class="ss-coll-ctx">
          <div class="ss-ctx-h">AW26 context</div>
          <div class="ss-ctx-row"><span class="ss-ctx-dot" style="background:var(--sage)"></span>${colNameSS(l?.params?.bg||ssState.base)} appears in ${Math.floor(Math.random()*3+4)} approved styles.</div>
          ${l&&l.pattern!=='solid'?`<div class="ss-ctx-row"><span class="ss-ctx-dot" style="background:var(--cobalt)"></span>${SS_PATTERNS[l.pattern]?.name||''} — no approved ${g.label.toLowerCase()} in AW26 uses this pattern yet.</div>`:''}
          <div class="ss-ctx-row"><span class="ss-ctx-dot" style="background:${guardrail.warn?'var(--ochre)':'var(--sage)'}"></span>${guardrail.warn?'Brand note — see guardrail above.':'Surface reads on-brand for Meridian.'}</div>
        </div>
      </div>
    </div>

    <!-- colourway run -->
    <div class="ss-cw-sec">
      <div class="dec-sec-head"><div><h3>Colourway run</h3><div class="dsh-sub">This design auto-rendered across the palette</div></div></div>
      <div class="ss-cw-grid">${ssColorways().map(cw=>`<div class="ss-cw"><div class="ss-cw-fig">${ssColorwaySVG(cw)}</div><div class="ss-cw-name">${cw.name}</div></div>`).join('')}</div>
    </div>
  </div>`;
}

function ssOpenCompare(){
  if(ssState.versions.length<2){ssToast('Save at least 2 versions to compare');return;}
  const v1=ssState.versions[0],v2=ssState.versions[ssState.versions.length-1];
  openDrawer(`<div class="dr-card" style="margin-top:8px"><div class="ey" style="color:var(--cobalt)">Version comparison</div>
    <h2 style="font-size:20px;margin-bottom:14px">${v1.name} vs ${v2.name}</h2>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      ${[v1,v2].map(v=>{const state={...ssState,garment:v.garment,surfaces:v.surfaces};const g2=SS_GARMENTS[v.garment];
        return `<div><div style="font-weight:700;margin-bottom:8px">${v.name}</div>
          <div style="background:var(--paper);border-radius:10px;padding:14px;height:200px;display:flex;align-items:center;justify-content:center">
            <svg viewBox="${g2.viewBox}" style="height:100%;width:auto">${Object.keys(g2.regions).map(k=>{const su=v.surfaces[k];const l=su?.layers[0];return `<path d="${g2.regions[k].d}" fill="${l?.params?.bg||ssState.base}" stroke="#16150F" stroke-width="1" stroke-opacity=".2"/>`;}).join('')}</svg>
          </div></div>`;}).join('')}
    </div>
    <button class="btn ghost" style="margin-top:16px;width:100%" onclick="closeDrawer()">Close</button>
  </div>`);
}
window.ssOpenCompare=ssOpenCompare;

function colNameSS(hex){const c=COLORS.find(x=>x.h.toLowerCase()===(hex||'').toLowerCase());return c?c.n:hex;}
function ssToast(m){if(typeof toast==='function')toast(m);}
function ssRender(){renderSurfaceStudio();}



/* ============================================================
   COLLECTION CREATOR — Level 4: AI proposes the whole range
   The creative-director's assistant.
   Input: season, occasion, market, price range, count, style direction
   Output: proposed range with silhouettes, colour story, price architecture,
           occasion spread, outfit combinations, stylings — all briefable into Studio
   ============================================================ */

const ccState = {
  loading: false,
  brief: {
    season:'', occasion:'', market:'', priceFrom:'', priceTo:'',
    count:'', direction:'', brand:'Meridian', extra:''
  },
  collection: null,   // the AI-proposed collection
  activeStyle: null,  // selected style in the range
  view: 'range'       // range | outfits | colorstory | architecture
};

function renderCollectionCreator(){
  const host = document.getElementById('view-collcreate');
  if(!host) return;
  if(ccState.loading){
    host.innerHTML = `<div class="cc-loading"><div class="cc-spin">⟳</div><h2>Atelier is building your collection…</h2><p>Proposing the range, colour story, price architecture and outfit logic</p></div>`;
    return;
  }
  if(!ccState.collection){
    renderCCBrief(host); return;
  }
  renderCCResult(host);
}

function renderCCBrief(host){
  const b = ccState.brief;
  const SEASONS=['SS25','AW25','SS26','AW26','SS27','Resort 27'];
  const OCCASIONS=['Everyday','Work','Evening','Weekend','Occasion','Resort','Activewear'];
  const MARKETS=['Global','Europe','USA','Japan / APAC','Middle East','UK'];
  host.innerHTML=`
    <div class="vh"><div><div class="eyebrow">Collection Creator · AI</div><h1>Create a collection</h1>
      <p>Describe what you need — season, market, price and creative direction — and Atelier proposes the full range: silhouettes, colour story, price architecture, outfit logic and briefs for Studio.</p></div></div>
    <div class="cc-brief-wrap">
      <div class="cc-brief-form">
        <div class="cc-brief-grid">
          <div class="cc-field"><label>Season</label>
            <div class="cc-opts">${SEASONS.map(s=>`<button class="cc-opt ${b.season===s?'on':''}" onclick="ccState.brief.season='${s}';renderCollectionCreator()">${s}</button>`).join('')}</div></div>
          <div class="cc-field"><label>Market</label>
            <div class="cc-opts">${MARKETS.map(s=>`<button class="cc-opt ${b.market===s?'on':''}" onclick="ccState.brief.market='${s}';renderCollectionCreator()">${s}</button>`).join('')}</div></div>
          <div class="cc-field cc-span2"><label>Occasions <span style="color:var(--ink-3);font-weight:400">select all that apply</span></label>
            <div class="cc-opts">${OCCASIONS.map(s=>`<button class="cc-opt ${b.occasion.includes(s)?'on':''}" onclick="ccOccasionToggle('${s}')">${s}</button>`).join('')}</div></div>
          <div class="cc-field"><label>Price from (€)</label><input class="cc-inp" value="${b.priceFrom}" placeholder="e.g. 80" oninput="ccState.brief.priceFrom=this.value"></div>
          <div class="cc-field"><label>Price to (€)</label><input class="cc-inp" value="${b.priceTo}" placeholder="e.g. 580" oninput="ccState.brief.priceTo=this.value"></div>
          <div class="cc-field"><label>Number of styles</label><input class="cc-inp" value="${b.count}" placeholder="e.g. 18" oninput="ccState.brief.count=this.value"></div>
          <div class="cc-field cc-span2"><label>Creative direction</label>
            <textarea class="cc-ta" rows="3" placeholder="e.g. Summer in Southern Italy. Linen-led, relaxed but sharp, tonal terracotta and chalk palette, wide-leg trousers, easy tailoring, dresses that go day to night." oninput="ccState.brief.direction=this.value">${b.direction}</textarea></div>
          <div class="cc-field cc-span2"><label>Additional constraints <span style="color:var(--ink-3);font-weight:400">optional</span></label>
            <textarea class="cc-ta" rows="2" placeholder="e.g. Avoid outerwear. Must include a hero dress. Entry price capped at €120." oninput="ccState.brief.extra=this.value">${b.extra}</textarea></div>
        </div>
        <div class="cc-brief-foot">
          <div class="cc-brief-summary">${ccBriefSummary()}</div>
          <button class="btn cc-gen-btn" onclick="ccGenerate()" ${ccBriefValid()?'':'disabled'}>✦ Build this collection →</button>
        </div>
      </div>
      <div class="cc-brief-examples">
        <div class="cc-eg-h">Example briefs</div>
        ${[
          {label:'SS26 resort · Japan · linen, €140–€480 · 14 styles',direction:'Easy resort, Japan market. Linen and cotton, wabi-sabi proportions. Neutral bleach and indigo palette. No outerwear.',season:'SS26',market:'Japan / APAC',occasion:'Everyday,Weekend,Resort',priceFrom:'140',priceTo:'480',count:'14'},
          {label:'AW26 work · Europe · structured, €180–€640 · 20 styles',direction:'Sharp European workwear. Wool tailoring, structured knitwear. Charcoal, chalk and burgundy. Must anchor with a hero coat.',season:'AW26',market:'Europe',occasion:'Work,Everyday,Evening',priceFrom:'180',priceTo:'640',count:'20'},
          {label:'SS26 weekend · Global · casual, €80–€320 · 16 styles',direction:'Relaxed weekend wardrobe. Organic cotton, denim, linen. Faded terracotta and bone. Lots of separates that mix-and-match.',season:'SS26',market:'Global',occasion:'Weekend,Everyday',priceFrom:'80',priceTo:'320',count:'16'}
        ].map(eg=>`<button class="cc-eg" onclick="ccLoadExample(${JSON.stringify(eg).replace(/"/g,"'")})">
          <div class="cc-eg-l">${eg.label}</div>
          <div class="cc-eg-d">${eg.direction.slice(0,80)}…</div>
        </button>`).join('')}
      </div>
    </div>`;
}

function ccOccasionToggle(o){
  const curr = ccState.brief.occasion.split(',').filter(Boolean);
  const idx = curr.indexOf(o);
  if(idx>=0) curr.splice(idx,1); else curr.push(o);
  ccState.brief.occasion = curr.join(',');
  renderCollectionCreator();
}
function ccLoadExample(eg){
  Object.assign(ccState.brief,eg);renderCollectionCreator();
}
function ccBriefSummary(){
  const b=ccState.brief;
  if(!b.season&&!b.direction) return 'Fill in the brief above to get started.';
  const parts=[b.season,b.market,b.occasion,b.count?b.count+' styles':'',b.priceFrom&&b.priceTo?'€'+b.priceFrom+'–€'+b.priceTo:''].filter(Boolean);
  return parts.join(' · ')||'—';
}
function ccBriefValid(){return !!(ccState.brief.direction&&ccState.brief.season&&ccState.brief.count);}
window.ccOccasionToggle=ccOccasionToggle;window.ccLoadExample=ccLoadExample;

async function ccGenerate(){
  if(!ccBriefValid()) return;
  ccState.loading = true; renderCollectionCreator();
  const b = ccState.brief;
  const dna = DNA_CORE;
  const systemPrompt = `You are Atelier, the AI collection-planning assistant for ${b.brand}, an architectural, tonal, minimal contemporary brand.

Brand codes: ${dna.codes.join(', ')}
Brand hero products: ${dna.product.join(', ')}
Visual DNA: ${dna.visual.join(', ')}
Avoid: ${dna.forbidden.join(', ')}

The team has given you a collection brief. Your job: propose a complete, coherent range that makes sense as a real commercial collection — pieces that style together, cover the right occasions, create a clear colour story, and balance the price architecture.

Respond ONLY with a JSON object, no markdown:
{
  "title": "collection name",
  "concept": "2-3 sentence creative concept",
  "colourStory": {
    "palette": [{"name":"colour name","hex":"#xxxxxx","role":"hero|core|accent|neutral"}],
    "rationale": "one sentence"
  },
  "styles": [
    {
      "id": "S01",
      "name": "style name",
      "category": "Dress|Knitwear|Tailoring|Trousers|Outerwear|Tops|Skirt|Denim",
      "silhouette": "brief description",
      "fabric": "main fabric",
      "colour": "colour name from palette",
      "hex": "#xxxxxx",
      "price": 000,
      "occasion": "Everyday|Work|Evening|Weekend|Occasion",
      "collectionRole": "hero|core|statement|entry|supporting",
      "outfitsWith": ["S02","S05"],
      "brief": "one sentence design brief for Studio"
    }
  ],
  "outfits": [
    {"name":"outfit name","styles":["S01","S03"],"occasion":"Weekend","description":"one sentence"}
  ],
  "priceArchitecture": {
    "entry": "€xx–€xx (N styles)",
    "core": "€xx–€xx (N styles)",
    "premium": "€xx–€xx (N styles)",
    "hero": "€xx–€xx (N styles)"
  },
  "gaps": ["any strategic gaps or risks in the range"],
  "designerNotes": "overall advice to the creative director"
}`;
  const userMsg = `Brief: ${b.season} · ${b.market} · ${b.occasion} · €${b.priceFrom}–€${b.priceTo} · ${b.count} styles\n\nDirection: ${b.direction}\n\nConstraints: ${b.extra||'none'}`;
  try{
    const res = await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'claude-sonnet-4-6',max_tokens:4000,system:systemPrompt,messages:[{role:'user',content:userMsg}]})});
    const data = await res.json();
    const raw = data.content?.[0]?.text||'{}';
    let col;
    try{col=JSON.parse(raw.replace(/```json|```/g,'').trim());}catch(e){ccState.loading=false;ccState.collection={error:'Could not parse response. Try again.'};renderCollectionCreator();return;}
    ccState.collection = col;
    ccState.loading = false;
    ccState.view = 'range';
    renderCollectionCreator();
    if(typeof toast==='function') toast('Collection: '+col.title);
  }catch(e){
    ccState.loading=false;ccState.collection={error:'Generation failed. Check your connection.'};renderCollectionCreator();
  }
}
window.ccGenerate=ccGenerate;

function renderCCResult(host){
  const col = ccState.collection;
  if(col.error){host.innerHTML=`<div style="padding:40px;text-align:center"><h3>${col.error}</h3><button class="btn ghost" onclick="ccState.collection=null;renderCollectionCreator()">Try again</button></div>`;return;}
  const styles = col.styles||[];
  const palette = col.colourStory?.palette||[];
  const outfits = col.outfits||[];
  const view = ccState.view;
  host.innerHTML=`
    <div class="cc-result-wrap">
      <div class="cc-result-header">
        <div>
          <div class="eyebrow">Collection Creator · AI proposal</div>
          <h1 class="cc-title">${col.title||'Proposed collection'}</h1>
          <p class="cc-concept">${col.concept||''}</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn ghost" onclick="ccState.collection=null;ccState.brief={season:'',occasion:'',market:'',priceFrom:'',priceTo:'',count:'',direction:'',brand:'Meridian',extra:''};renderCollectionCreator()">New brief</button>
          <button class="btn ghost" onclick="ccExportRange()">Export range plan</button>
          <button class="btn" onclick="ccBriefAll()">Brief all to Studio →</button>
        </div>
      </div>

      <div class="cc-view-tabs">
        ${[['range','Range'],['outfits','Outfits'],['colorstory','Colour story'],['architecture','Price plan']].map(([v,l])=>`<button class="cc-vtab ${view===v?'on':''}" onclick="ccState.view='${v}';renderCollectionCreator()">${l}</button>`).join('')}
      </div>

      ${view==='range'?ccRangeView(styles,palette):
        view==='outfits'?ccOutfitsView(outfits,styles):
        view==='colorstory'?ccColorView(col.colourStory,styles):
        ccArchView(col.priceArchitecture,styles,col.gaps,col.designerNotes)}
    </div>`;
}

function ccRangeView(styles,palette){
  const roles={'hero':'var(--ember)','core':'var(--cobalt)','statement':'var(--ochre)','entry':'var(--sage)','supporting':'var(--ink-3)'};
  return `<div class="cc-range-grid">${styles.map((s,i)=>`
    <div class="cc-style-card ${ccState.activeStyle===s.id?'sel':''}" onclick="ccState.activeStyle=s.id===ccState.activeStyle?null:s.id;renderCollectionCreator()">
      <div class="cc-sc-fig" style="background:${s.hex||'#9A968B'}">
        ${mtile({color:s.hex||'#9A968B',fabric:s.fabric||'Organic cotton',garmentKey:ccGarmentKey(s.category),img:photoFor(ccGarmentKey(s.category),'Minimal','women')})}
        <span class="cc-sc-id">${s.id}</span>
        <span class="cc-sc-role" style="background:${roles[s.collectionRole]||'var(--ink-3)'}">
          ${(s.collectionRole||'').toUpperCase()}</span>
      </div>
      <div class="cc-sc-body">
        <div class="cc-sc-name">${s.name}</div>
        <div class="cc-sc-meta">${s.category} · ${s.fabric}</div>
        <div class="cc-sc-meta">€${s.price} · ${s.occasion}</div>
        <div class="cc-sc-brief">${s.brief}</div>
        ${ccState.activeStyle===s.id?`<div class="cc-sc-pairs">Outfits with: ${(s.outfitsWith||[]).join(', ')||'—'}</div>
          <button class="btn cc-sc-btn" onclick="event.stopPropagation();ccBriefStyle(${i})">Brief to Studio →</button>`:
          ''}
      </div>
    </div>`).join('')}
  </div>
  ${col=>col.designerNotes?`<div class="cc-designer-note"><span class="cc-dn-h">Creative director note</span>${col.designerNotes}</div>`:''}`
}
// Fix: pass col.designerNotes properly
function ccRangeView(styles,palette){
  const col=ccState.collection;
  const roles={'hero':'var(--ember)','core':'var(--cobalt)','statement':'var(--ochre)','entry':'var(--sage)','supporting':'var(--ink-3)'};
  return `<div class="cc-range-grid">${styles.map((s,i)=>`
    <div class="cc-style-card ${ccState.activeStyle===s.id?'sel':''}" onclick="ccState.activeStyle=s.id===ccState.activeStyle?null:s.id;renderCollectionCreator()">
      <div class="cc-sc-fig" style="background:${s.hex||'#9A968B'}">
        ${mtile({color:s.hex||'#9A968B',fabric:s.fabric||'Organic cotton',garmentKey:ccGarmentKey(s.category),img:photoFor(ccGarmentKey(s.category),'Minimal','women')})}
        <span class="cc-sc-id">${s.id}</span>
        <span class="cc-sc-role" style="background:${roles[s.collectionRole]||'var(--ink-3)'}">
          ${(s.collectionRole||'').toUpperCase()}</span>
      </div>
      <div class="cc-sc-body">
        <div class="cc-sc-name">${s.name}</div>
        <div class="cc-sc-meta">${s.category} · ${s.fabric}</div>
        <div class="cc-sc-price">€${s.price} · ${s.occasion}</div>
        <div class="cc-sc-brief">${s.brief}</div>
        ${ccState.activeStyle===s.id?`<div class="cc-sc-pairs">Pairs with: ${(s.outfitsWith||[]).join(', ')||'—'}</div>
          <button class="btn cc-sc-btn" onclick="event.stopPropagation();ccBriefStyle(${i})">Brief to Studio →</button>`:''}
      </div>
    </div>`).join('')}</div>
    ${col.designerNotes?`<div class="cc-designer-note"><span class="cc-dn-h">Atelier note to creative director</span>${col.designerNotes}</div>`:''}
    ${col.gaps&&col.gaps.length?`<div class="cc-gaps"><span class="cc-dn-h">Range gaps to consider</span><ul>${col.gaps.map(g=>`<li>${g}</li>`).join('')}</ul></div>`:''}`;
}

function ccOutfitsView(outfits,styles){
  const styleMap={};styles.forEach(s=>{styleMap[s.id]=s;});
  return `<div class="cc-outfits-grid">${outfits.map(o=>`
    <div class="cc-outfit">
      <div class="cc-outfit-h"><span class="cc-outfit-name">${o.name}</span><span class="cc-outfit-occ">${o.occasion}</span></div>
      <div class="cc-outfit-pieces">${(o.styles||[]).map(id=>{const s=styleMap[id];if(!s)return '';return `<div class="cc-op" style="background:${s.hex||'#9A968B'}">${mtile({color:s.hex||'#9A968B',fabric:s.fabric||'Organic cotton',garmentKey:ccGarmentKey(s.category),img:photoFor(ccGarmentKey(s.category),'Minimal','women')})}<span class="cc-op-n">${s.name}</span></div>`;}).join('')}</div>
      <div class="cc-outfit-desc">${o.description||''}</div>
    </div>`).join('')}
  </div><p class="cc-note">Outfit combinations show which pieces style together — this is how the line creates wardrobe logic for the customer. ${outfits.length} combinations from ${styles.length} styles.</p>`;
}

function ccColorView(story,styles){
  const palette=(story?.palette||[]);
  const catCount={};styles.forEach(s=>{catCount[s.colour]=(catCount[s.colour]||0)+1;});
  return `
    <div class="cc-color-wrap">
      <div class="cc-palette-strip">${palette.map(c=>`<div class="cc-pal-chip"><div class="cc-pal-swatch" style="background:${c.hex}"></div><div class="cc-pal-name">${c.name}</div><div class="cc-pal-role">${c.role}</div><div class="cc-pal-count">${catCount[c.name]||0} styles</div></div>`).join('')}</div>
      <p style="font-size:13px;color:var(--ink-2);line-height:1.55;margin:0 0 14px">${story?.rationale||''}</p>
      <div class="cc-color-by-style"><div class="cc-dn-h" style="margin-bottom:10px">Colour by style</div>
        ${styles.map(s=>`<div class="cc-cbs-row"><div class="cc-cbs-chip" style="background:${s.hex||'#9A968B'}"></div><span class="cc-cbs-n">${s.name}</span><span class="cc-cbs-c">${s.colour}</span></div>`).join('')}
      </div>
    </div>`;
}

function ccArchView(arch,styles,gaps,note){
  const total=styles.length;
  const byOcc={};styles.forEach(s=>{byOcc[s.occasion]=(byOcc[s.occasion]||0)+1;});
  return `<div class="cc-arch-wrap">
    <div class="cc-arch-grid">
      ${arch?Object.entries(arch).map(([tier,range])=>`<div class="cc-arch-card"><div class="cc-arch-tier">${tier.charAt(0).toUpperCase()+tier.slice(1)}</div><div class="cc-arch-range">${range}</div></div>`).join(''):''}
    </div>
    <div class="cc-occ-bars">
      <div class="cc-dn-h" style="margin:14px 0 8px">Occasion spread</div>
      ${Object.entries(byOcc).sort((a,b)=>b[1]-a[1]).map(([occ,n])=>`<div class="cc-occ-row"><span class="cc-occ-l">${occ}</span><span class="cc-occ-bar"><i style="width:${Math.round(n/total*100)}%;background:var(--cobalt)"></i></span><span class="cc-occ-n">${n}</span></div>`).join('')}
    </div>
  </div>`;
}

function ccGarmentKey(cat){
  return {Dress:'dress',Knitwear:'knit',Tailoring:'blazer',Trousers:'trousers',Outerwear:'coat',Tops:'tee',Skirt:'skirt',Denim:'trousers'}[cat]||'dress';
}

function ccBriefStyle(i){
  const s=ccState.collection.styles[i];
  if(!s)return;
  if(typeof openBrief==='function') openBrief(s.name);
  if(typeof toast==='function') toast('Briefed to Studio: '+s.name);
}
function ccBriefAll(){
  const styles=ccState.collection?.styles||[];
  styles.slice(0,3).forEach((_,i)=>setTimeout(()=>ccBriefStyle(i),i*200));
  if(typeof toast==='function') toast('Briefed '+styles.length+' styles to Studio');
}
function ccExportRange(){
  const col=ccState.collection;if(!col)return;
  const styles=col.styles||[];
  if(typeof openDrawer==='function'){
    openDrawer(`<div class="dr-card" style="margin-top:8px">
      <div class="ey" style="color:var(--cobalt)">Range plan · AI proposal</div>
      <h2 style="font-size:20px;margin-bottom:4px">${col.title}</h2>
      <p style="font-size:12px;color:var(--ink-3);margin-bottom:14px">${styles.length} styles · Atelier AI proposal · Not approved</p>
      <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>ID</th><th>Style</th><th>Category</th><th>Fabric</th><th>Colour</th><th>Price</th><th>Occasion</th><th>Role</th></tr></thead>
        <tbody>${styles.map(s=>`<tr><td class="mono">${s.id}</td><td style="font-weight:600">${s.name}</td><td>${s.category}</td><td>${s.fabric}</td><td><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${s.hex};margin-right:4px"></span>${s.colour}</td><td>€${s.price}</td><td>${s.occasion}</td><td>${s.collectionRole}</td></tr>`).join('')}</tbody>
      </table></div>
      <p style="font-size:11px;color:var(--ink-3);margin-top:12px">This is an AI-proposed range plan, not an approved collection. Each style needs a brief, design development and commercial review before inclusion in AW26.</p>
      <div style="display:flex;gap:8px;margin-top:14px"><button class="btn" onclick="ccBriefAll();closeDrawer()">Brief all to Studio</button><button class="btn ghost" onclick="closeDrawer()">Close</button></div>
    </div>`);
  }
}
window.ccBriefStyle=ccBriefStyle;window.ccBriefAll=ccBriefAll;window.ccExportRange=ccExportRange;
window.renderCollectionCreator=renderCollectionCreator;


/* ===== routing ===== */
const TITLES={dashboard:'Home',catalog:'Catalog',trends:'Signals',competitors:'Competitors',products:'Visual search',surface:'Surface Studio',collcreate:'Collection Creator',whitespace:'Opportunities',whitespace2:'Collections',studio:'Design Studio',briefs:'Briefs',boards:'Development pipeline',reports:'Research',alerts:'Alerts',analytics:'Outcomes',backtest:'Backtest',brand:'Brand DNA',decisions:'Decisions',integrations:'Integrations'};
const RENDERERS={dashboard:renderHome,analytics:renderOutcomes,competitors:renderCompetitors,products:renderVisualSearch,surface:renderSurfaceStudio,collcreate:renderCollectionCreator,whitespace:renderWhitespace,reports:renderReports,alerts:renderAlerts,boards:renderBoards,trends:renderPlates,brand:renderBrandEngine,decisions:renderDecisionMemory,whitespace2:renderCollectionReview,catalog:renderCatalog,backtest:renderBacktest,briefs:renderBriefs};
function go(view){document.querySelectorAll('.view').forEach(v=>v.classList.remove('on'));document.getElementById('view-'+view).classList.add('on');document.querySelectorAll('.nav-item').forEach(n=>n.classList.toggle('active',n.dataset.view===view));document.getElementById('crumb').textContent=TITLES[view];document.getElementById('sidebar').classList.remove('open');if(RENDERERS[view])RENDERERS[view]();window.scrollTo({top:0});}
window.go=go;window.closeDrawer=closeDrawer;

/* ===== events ===== */
document.querySelectorAll('.nav-item').forEach(n=>n.addEventListener('click',()=>go(n.dataset.view)));
document.getElementById('ham').addEventListener('click',()=>document.getElementById('sidebar').classList.toggle('open'));
document.getElementById('signalSwitch').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;mode=b.dataset.mode;document.querySelectorAll('#signalSwitch button').forEach(x=>x.classList.toggle('on',x===b));renderPlates();});
document.getElementById('genderSeg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;gender=b.dataset.g;document.querySelectorAll('#genderSeg button').forEach(x=>x.classList.toggle('on',x===b));renderPlates();});
document.querySelectorAll('[data-tag]').forEach(c=>c.addEventListener('click',()=>{const t=c.dataset.tag;tagFilter=tagFilter===t?null:t;document.querySelectorAll('[data-tag]').forEach(x=>x.classList.toggle('on',x.dataset.tag===tagFilter));renderPlates();}));
document.getElementById('radarModes').addEventListener('click',e=>{const b=e.target.closest('.rmode');if(!b)return;radarMode=b.dataset.rm;document.querySelectorAll('#radarModes .rmode').forEach(x=>x.classList.toggle('on',x===b));renderPlates();});
document.getElementById('radarBody').addEventListener('click',e=>{const plate=e.target.closest('.plate');if(!plate)return;if(e.target.closest('.genbtn')||e.target.closest('.openbtn')&&false)return;const id=plate.dataset.id;if(e.target.closest('.openbtn')){openOpp(id);return;}openOpp(id);});
function setStudioPane(p){document.querySelectorAll('.studio-pane').forEach(x=>x.classList.remove('on'));document.getElementById('pane-'+p).classList.add('on');document.querySelectorAll('#studioTabs button').forEach(b=>b.classList.toggle('on',b.dataset.pane===p));}
window.setStudioPane=setStudioPane;
document.getElementById('studioTabs').addEventListener('click',e=>{const b=e.target.closest('button');if(b)setStudioPane(b.dataset.pane);});
document.querySelectorAll('.opts[data-single]').forEach(grp=>grp.addEventListener('click',e=>{const b=e.target.closest('.opt');if(!b)return;grp.querySelectorAll('.opt').forEach(x=>x.classList.toggle('on',x===b));const key=grp.dataset.grp;gen[key]=b.dataset.v;if(key==='category')gen.garment=b.dataset.g;if(key==='fabric')renderSwatches();renderSpec();}));
document.querySelector('[data-grp="sizes"]').addEventListener('click',e=>{const b=e.target.closest('.size');if(!b)return;b.classList.toggle('on');gen.sizes=[...document.querySelectorAll('[data-grp="sizes"] .size.on')].map(x=>x.dataset.v);});
document.getElementById('swatches').addEventListener('click',e=>{const b=e.target.closest('.swpick');if(!b)return;const h=b.dataset.h;if(gen.colors.includes(h))gen.colors=gen.colors.filter(x=>x!==h);else{if(gen.colors.length>=3){toast('Up to 3 colours');return;}gen.colors.push(h);}b.classList.toggle('on');renderBOM();});
document.getElementById('dirInput').addEventListener('input',()=>{});
document.getElementById('genGo').addEventListener('click',generate);
document.getElementById('intg').addEventListener('click',e=>{const b=e.target.closest('.cbtn');if(!b)return;const card=b.closest('.intg-card');const linked=card.classList.toggle('linked');b.textContent=linked?'Manage':'Connect';card.querySelector('.st').innerHTML=(linked?'● ':'○ ')+(linked?'Connected just now':'Not connected');toast((linked?'Connected ':'Disconnected ')+b.dataset.n);});
function syncGenUI(){document.querySelectorAll('.opts[data-single]').forEach(grp=>{const key=grp.dataset.grp;grp.querySelectorAll('.opt').forEach(x=>x.classList.toggle('on',x.dataset.v===gen[key]));});renderSwatches();renderSpec();}

/* ===== v3 data ===== */
const STATES=[{k:'Weak signals',c:'#8C8A7E',n:8,l:'on the radar, unproven'},{k:'Emerging',c:'#C8821E',n:5,l:'worth a micro-run'},{k:'Accelerating',c:'#3F6B4F',n:4,l:'window open now'},{k:'Mainstream',c:'#1F2BD6',n:6,l:'table stakes'},{k:'Saturation',c:'#B23A2E',n:3,l:'avoid late entry'}];
const CMP_BRANDS_DATA=[
 {init:'GE',c:'#16150F',nm:'GEEL',group:'direct',seg:'Direct · DTC',crawl:'2h ago',covered:412,depth:'18 mo',conf:'High',
  change:{type:'Assortment shift',conf:'High',headline:'Sheer-knit share rose 12% → 34% in 60 days',detail:'14 new styles · avg €238 · 8 still full price · mostly bone, black, stone',expose:'Meridian has no comparable knit entry in AW26.'},
  timeline:[{d:'Mon · Jun 16',t:'New AW capsule live',p:'18 styles, knit-led',badge:'Drop',bc:'var(--cobalt-wash)',tc:'var(--cobalt-ink)'},{d:'Tue · Jun 17',t:'14 products added',p:'sheer rib knit, tonal palette',badge:'+14',bc:'#E9F1EC',tc:'var(--sage)'},{d:'Wed · Jun 18',t:'20% sitewide promo',p:'48-hour window',badge:'Promo',bc:'var(--clay-wash)',tc:'var(--clay)'},{d:'Fri · Jun 20',t:'Collaboration teased',p:'with a Seoul knit studio',badge:'Collab',bc:'var(--ink)',tc:'#fff'}]},
 {init:'CO',c:'#4A4944',nm:'COS',group:'direct',seg:'Direct · retail',crawl:'3h ago',covered:1180,depth:'14 mo',conf:'High',
  change:{type:'Pricing',conf:'Medium',headline:'Entry knitwear price up ~8% this season',detail:'Core merino moved €90 → €98 · premium line unchanged',expose:'Narrows the gap to Meridian entry knit.'},
  timeline:[{d:'Mon · Jun 16',t:'Knit price uplift',p:'core merino +8%',badge:'Price',bc:'var(--ochre-wash)',tc:'var(--ochre)'},{d:'Thu · Jun 19',t:'9 products restocked',p:'best-selling tailoring',badge:'Restock',bc:'#E9F1EC',tc:'var(--sage)'}]},
 {init:'TÔ',c:'#9C4A2E',nm:'Toteme',group:'aspirational',seg:'Aspirational',crawl:'4h ago',covered:683,depth:'24 mo',conf:'High',
  change:{type:'Category expansion',conf:'High',headline:'Widened tailoring into relaxed fits — 9 new trouser SKUs',detail:'avg €440 · premium positioning held · no promo',expose:'Signals where the aspirational tier is moving on tailoring.'},
  timeline:[{d:'Tue · Jun 17',t:'9 new trouser SKUs',p:'relaxed tailoring',badge:'+9',bc:'#E9F1EC',tc:'var(--sage)'},{d:'Fri · Jun 20',t:'Editorial campaign',p:'AW tailoring focus',badge:'Campaign',bc:'var(--ink)',tc:'#fff'}]},
 {init:'AR',c:'#3C4C68',nm:'Arket',group:'retailer',seg:'Retailer · reference',crawl:'6h ago',covered:1842,depth:'12 mo',conf:'Medium',
  change:{type:'Promotion',conf:'High',headline:'Cut promotional depth — holding full price longer',detail:'discounted share 22% → 13% over 30 days',expose:'Market-wide signal that full-price discipline is returning.'},
  timeline:[{d:'Mon · Jun 16',t:'Promo depth cut',p:'22% → 13% discounted',badge:'Promo',bc:'var(--clay-wash)',tc:'var(--clay)'},{d:'Wed · Jun 18',t:'New basics drop',p:'24 styles',badge:'Drop',bc:'var(--cobalt-wash)',tc:'var(--cobalt-ink)'}]}
];
const CMP_GROUPS={direct:'Direct competitors',aspirational:'Aspirational',emerging:'Emerging',retailer:'Retailers & references'};
const CMP_SUMMARY=[
 {init:'GE',c:'#16150F',nm:'GEEL',seg:'Direct · DTC',p:'Sheer knitwear presence up — its biggest catalogue shift in 60 days.',big:'+24% knitwear'},
 {init:'TÔ',c:'#9C4A2E',nm:'Toteme',seg:'Aspirational',p:'Quietly widened tailoring into relaxed fits; 9 new trouser SKUs.',big:'9 new trousers'},
 {init:'AR',c:'#3C4C68',nm:'Arket',seg:'Retailer',p:'Cut promotional depth — holding full price markedly longer.',big:'−12% promo'}
];
const DROP_TIMELINE=CMP_BRANDS_DATA[0].timeline;
const CMP_TABLE=[
 {r:'Median full price',vals:['€320','€280','€440','€140','€190']},
 {r:'Drop cadence',vals:['Monthly','2× / mo','Seasonal','Weekly','Weekly']},
 {r:'Knitwear share',vals:['18%','34% ▲','22%','26%','30%']},
 {r:'% discounted',vals:['9%','16%','7%','22%','24%']},
 {r:'Tailoring share',vals:['26%','14%','38%','12%','16%']}
];
const CMP_BRANDS=['Meridian','GEEL','Toteme','Arket','COS'];
const WHITESPACE=[
 {name:'Textured mini dress',x:86,y:24,r:30,c:'#B07A5B',cat:'Dress',price:'€140–220',g:'dress',f:'Linen'},
 {name:'Sheer rib knit',x:90,y:30,r:26,c:'#9A968B',cat:'Knitwear',price:'€180–260',g:'knit',f:'Rib knit'},
 {name:'Unlined chore coat',x:70,y:34,r:20,c:'#4A4944',cat:'Outerwear',price:'€420–560',g:'coat',f:'Twill'},
 {name:'Barrel jean',x:78,y:58,r:22,c:'#3C4C68',cat:'Denim',price:'€190–240',g:'trousers',f:'Denim'},
 {name:'Drop-waist skirt',x:64,y:40,r:16,c:'#8B9079',cat:'Skirt',price:'€180–240',g:'skirt',f:'Tencel'},
 {name:'Cropped puffer',x:54,y:74,r:14,c:'#1B1A14',cat:'Outerwear',price:'€300–360',g:'coat',f:'Technical shell'},
 {name:'Box tee',x:44,y:82,r:12,c:'#E7E1D3',cat:'Tee',price:'€80–110',g:'tee',f:'Organic cotton'}
];
const REPORTS=[
 {kind:'ed',k:'Editorial',t:'The quiet return of craft',p:'Why visible making and hand-feel are pulling spend back from logo-led pieces.',market:'Global',read:'6 min',c:'#9C4A2E',g:'knit',f:'Merino wool',from:'Curated · matched to your tactile + tonal codes'},
 {kind:'auto',k:'Auto',t:'Knitwear is reshaping your set',p:'Four direct competitors expanded translucent knit in six weeks. You have no entry.',market:'USA',read:'2 min',c:'#9A968B',g:'knit',f:'Rib knit',from:'Generated from Opportunity · Sheer rib knit'},
 {kind:'ed',k:'Editorial',t:'Resort 26 · material forecast',p:"Bias satin, dry cottons and technical linens lead the season's hand.",market:'EU',read:'8 min',c:'#1B1A14',g:'dress',f:'Satin',from:'Curated · material forecast'},
 {kind:'auto',k:'Auto',t:'Indigo window: 4–6 weeks',p:'Search and resale momentum on washed indigo outpaces competitor supply.',market:'USA',read:'2 min',c:'#3C4C68',g:'trousers',f:'Denim',from:'Generated from Opportunity · Washed indigo'},
 {kind:'ed',k:'Editorial',t:'The new tailoring customer',p:'Who is buying soft-structured suiting — and what they reject.',market:'Global',read:'7 min',c:'#4A4944',g:'blazer',f:'Merino wool',from:'Curated · consumer DNA'},
 {kind:'auto',k:'Auto',t:'Your dress mix vs market',p:"Mini over-indexes; midi demand is rising where you're thin.",market:'USA',read:'3 min',c:'#B07A5B',g:'dress',f:'Tencel',from:'Generated from Collection review · AW26'}
];
const BOARD={
 Brief:[{n:'Sheer rib knit',cat:'Knitwear',gd:'Women',c:'#9A968B',f:'Rib knit',g:'knit',owner:'Elena',due:'Jul 1',src:'OP-014',blocker:null,review:null}],
 Concept:[{n:'Washed indigo barrel jean',cat:'Denim',gd:'Women',c:'#3C4C68',f:'Denim',g:'trousers',owner:'Elena',due:'Jul 4',src:'OP-021',blocker:null,review:null}],
 Review:[{n:'Bias slip dress — D2',cat:'Dress',gd:'Women',c:'#1B1A14',f:'Satin',g:'dress',owner:'Elena',due:'Jun 30',src:'OP-007',blocker:'Fabric opacity not approved',review:'Creative review required'}],
 Development:[{n:'Unlined chore coat',cat:'Outerwear',gd:'Men',c:'#3C4C68',f:'Twill',g:'coat',owner:'Priya',due:'Jul 8',src:'OP-018',blocker:null,review:null}],
 Sample:[{n:'Wide trouser — charcoal',cat:'Tailoring',gd:'Women',c:'#4A4944',f:'Twill',g:'trousers',owner:'Priya',due:'Jul 12',src:'OP-002',blocker:null,review:null}],
 Approved:[{n:'Ribbed merino tank',cat:'Knitwear',gd:'Women',c:'#E7E1D3',f:'Merino wool',g:'knit',owner:'Elena',due:'—',src:'OP-005',blocker:null,review:null}]
};
const BOARD_ORDER=['Brief','Concept','Review','Development','Sample','Approved'];
const BOARD_ARCHIVED=[{n:'Cropped puffer',cat:'Outerwear',gd:'Women',c:'#1B1A14',f:'Technical shell',g:'coat',owner:'Elena',reason:'Off-brand — conflicts with restraint codes'}];
const ALERTS=[
 {lv:'crit',k:'Critical',t:'Sheer knitwear accelerating across direct competitors',p:'Four brands increased translucent-knit offering over six weeks. Your collection has no entry in this category.',why:[['Competitors','4 brands ↑'],['Window','4–6 weeks'],['Brand fit','96/100']],sug:'Evaluate a small knit capsule',ev:'sheer knitwear'},
 {lv:'imp',k:'Important',t:'Boxy poplin shirt — clay · markdown risk',p:'Sell-through 19% at week 6 with stock cover at 88 days.',why:[['Sell-through','19%'],['Cover','88 days']],sug:'Mark down 20% or pull from reorder',ev:'poplin markdown'},
 {lv:'imp',k:'Important',t:'Washed indigo window opening',p:'Saves on indigo posts up 3.1×; two competitors dropped indigo capsules this week.',why:[['Saves','3.1×'],['Window','4–6 weeks']],sug:'Brief an indigo capsule',ev:'indigo window'},
 {lv:'info',k:'Info',t:'Ribbed merino tank — stock under a week',p:'Sell-through 92% in 9 days. Reorder before the indigo capsule pulls attention.',why:[['Cover','<7 days'],['Margin','41%']],sug:'Reorder 600 units',ev:'merino restock'}
];
const ROLES={
 owner:{av:'JR',who:'Jordan Reyes',title:'Founder / CEO',eye:'Week 25 · executive summary',ttl:'3 opportunities, 2 risks',sub:'The decisions waiting on you this week — opportunities, risks and the competitor moves that matter. Detail sits one click down.'},
 creative:{av:'EM',who:'Elena Marchetti',title:'Creative Director',eye:'Week 25 · Jun 16–22',ttl:"This week's brief",sub:'Prioritised actions for Meridian, read from your live sales, stock and the signals moving in your market. Work top-down.'},
 merch:{av:'PK',who:'Priya Kaur',title:'Merchandiser',eye:'Week 25 · assortment',ttl:'Price, depth & whitespace',sub:'Where the assortment is thin or crowded, how your price ladder sits against the set, and the gaps worth buying into.'},
 analyst:{av:'SD',who:'Sam Devlin',title:'Analyst',eye:'Week 25 · data',ttl:'Sources, models & confidence',sub:"Coverage, freshness and methodology behind this week's signals. Every score traces back to its sources."}
};
const SUGGEST={
 creative:['What colours are emerging this season?','Find products similar to our bias slip.','Adapt the sheer-knit trend to Meridian.'],
 owner:['What are the top three opportunities?','Which competitor changed the most?','What is the risk in the AW26 collection?'],
 merch:['Where is our price ladder exposed?','Which categories are saturated?','Show me whitespace in dresses.'],
 analyst:['How confident is the knitwear signal?','What sources feed brand fit?','Export the competitor comparison.']
};
let currentRole='creative';

/* ===== v3 renders ===== */
function renderStates(){const el=document.getElementById('stateRow');if(!el)return;el.innerHTML=STATES.map(s=>`<div class="statecol"><div class="sh"><span class="d" style="background:${s.c}"></span>${s.k}</div><div class="sc">${s.n}</div><div class="sl">${s.l}</div></div>`).join('');}
let cmpGroup='direct', cmpBrand=null;
function renderCompetitors(){
 const inGroup=CMP_BRANDS_DATA.filter(b=>b.group===cmpGroup);
 // watchlist tabs reflect real membership counts
 document.querySelectorAll('#watchtabs button').forEach(btn=>{
   const g=btn.dataset.w;const n=CMP_BRANDS_DATA.filter(b=>b.group===g).length;
   btn.classList.toggle('on',g===cmpGroup);
   btn.innerHTML=btn.textContent.replace(/ ·.*$/,'')+(n?` · ${n}`:' · 0');
 });
 if(!inGroup.length){
   document.getElementById('cmpSummary').innerHTML=`<div class="cs-empty">No <b>${CMP_GROUPS[cmpGroup]||cmpGroup}</b> brands are being monitored yet. Add one in your watchlist to start tracking this group.</div>`;
   document.getElementById('dropTimeline').innerHTML='';
   const tlH=document.getElementById('cmpTlHead');if(tlH)tlH.textContent='Change feed';
   const cov=document.getElementById('cmpCoverage');if(cov)cov.innerHTML='<div class="cov-row"><span class="cov-meta">No brands in this group.</span></div>';
   document.getElementById('cmpTable').innerHTML='';
   renderRail('railCompetitors',{see:`No ${CMP_GROUPS[cmpGroup]||cmpGroup} brands monitored.`,why:'This watchlist group is empty — Atelier only shows what it actually tracks.',rec:'Add competitors to populate this view.',acts:[['Back to Direct',()=>{cmpGroup='direct';cmpBrand=null;renderCompetitors();}]]});
   return;
 }
 const groupBrands=inGroup;
 if(!cmpBrand||!groupBrands.find(b=>b.nm===cmpBrand))cmpBrand=groupBrands[0].nm;
 const sel=groupBrands.find(b=>b.nm===cmpBrand)||groupBrands[0];
 // change cards for the selected group — clickable, drive the timeline
 document.getElementById('cmpSummary').innerHTML=groupBrands.map(c=>`<div class="cs ${c.nm===cmpBrand?'sel':''}" onclick="cmpBrand='${c.nm}';renderCompetitors()">
   <div class="h"><div class="lg" style="background:${c.c}">${c.init}</div><div class="nm">${c.nm}<small>${c.seg}</small></div><span class="cs-conf">${c.change.conf}</span></div>
   <div class="cs-type">${c.change.type}</div>
   <p>${c.change.headline}</p>
   <div class="cs-detail">${c.change.detail}</div>
 </div>`).join('')||`<div class="cs-empty">No brands in this watchlist group yet.</div>`;
 // timeline now follows the selected brand
 document.getElementById('dropTimeline').innerHTML=sel.timeline.map(t=>`<div class="tl"><div class="d">${t.d}</div><div class="t">${t.t}<span class="badge" style="background:${t.bc};color:${t.tc}">${t.badge}</span></div><div class="p">${t.p}</div></div>`).join('');
 const tlHead=document.getElementById('cmpTlHead');if(tlHead)tlHead.textContent='Change feed · '+sel.nm;
 // comparison table — honest median framing + accurate group label
 let head=`<tr><th>Metric</th>${CMP_BRANDS.map((b,i)=>`<th class="${i===0?'you':''}">${b}${i===0?' · you':''}</th>`).join('')}</tr>`;
 let bodyT=CMP_TABLE.map(row=>`<tr><td>${row.r}</td>${row.vals.map((v,i)=>`<td class="${i===0?'you':''}">${v}</td>`).join('')}</tr>`).join('');
 document.getElementById('cmpTable').innerHTML=head+bodyT;
 // per-brand coverage replaces the single 94% badge claim
 const covHead=document.getElementById('cmpCoverage');
 if(covHead)covHead.innerHTML=groupBrands.map(b=>`<div class="cov-row"><span class="cov-nm">${b.nm}</span><span class="cov-meta">${b.crawl} · ${b.covered} products · ${b.depth} · ${b.conf}</span></div>`).join('');
 // rail now attaches to the SELECTED brand, not a floating generic
 renderRail('railCompetitors',{
   see:`<b>${sel.nm}</b> (${CMP_GROUPS[sel.group]}): ${sel.change.headline}.`,
   why:sel.change.expose,
   rec:sel.group==='direct'?'Brief a response while the window is open — Opportunities can scope it.':'Monitor; this is context, not a direct threat.',
   acts:[['Evaluate as opportunity',()=>{go('whitespace');toast(sel.nm+' move → Opportunities');}],['Open evidence',()=>{openEvidence(sel.nm+' '+sel.change.type)}]]});
}
window.renderCompetitors=renderCompetitors;
/* ===== VISUAL SEARCH — design-precedent & differentiation engine, over the real catalog ===== */
// honest scope: searches Meridian's own catalog. Market/competitor/resale scopes need scraped data we don't have.
let vsSource=null;       // {style} chosen source product, or null
let vsRegion='whole';    // whole | silhouette | fabric | colour | price
let vsRank='visual';     // visual | brandaffinity | fabric | recent
let vsCompare=[];        // styles selected for comparison

// per-dimension similarity between a source style and a candidate, all from real attributes.
// We only score what we can actually derive: garment type, fabric (exact + family), colour palette, price.
// We do NOT score neckline, proportion or construction — that data isn't in the catalog, so we don't invent it.
function vsScore(src,cand){
  const sameG=src.g===cand.g;
  const sameCat=src.cat===cand.cat;
  const sameFab=src.f===cand.f;
  const fabFamily={'Satin':'fluid','Tencel':'fluid','Linen':'fluid','Merino wool':'knit','Rib knit':'knit','Twill':'structured','Denim':'structured','Organic cotton':'structured'};
  const sameFabFamily=fabFamily[src.f]&&fabFamily[src.f]===fabFamily[cand.f];
  const priceClose=Math.round(Math.max(0,100-Math.abs(src.price-cand.price)/Math.max(src.price,cand.price)*140));
  // colour = palette overlap only (no gender contamination)
  const colShare=src.colors.filter(c=>cand.colors.includes(c)).length;
  const colMax=Math.max(src.colors.length,cand.colors.length)||1;
  const colour=Math.round(colShare/colMax*100);
  // garment-type similarity (exact garment, then same category)
  const garment=sameG?92:sameCat?70:35;
  // fabric similarity (exact fabric, then same fabric family) — NOT construction
  const fabric=sameFab?92:sameFabFamily?62:28;
  // overall visual proxy from the dimensions we can defend
  const overall=Math.round(garment*0.5+fabric*0.3+colour*0.2);
  return {overall,garment,fabric,colour,price:priceClose};
}
// brand affinity: a heuristic read of how "Meridian-like" a style is — from returns, price band and category.
// NOT a DNA-code match (we don't tag garment-level codes), so it's labelled "affinity", not "brand fit".
function vsBrandAffinity(p){
  let s=58;
  if(p.returns<10)s+=12; else if(p.returns>15)s-=14;
  if(p.band==='Premium'||p.band==='Core')s+=10;
  if(['Tailoring','Knitwear','Dress','Outerwear'].includes(p.cat))s+=10;
  if(p.f==='Organic cotton'&&p.cat==='Tops')s-=8; // the poplin — weakest affinity
  return Math.max(20,Math.min(96,s));
}
function vsMatchWhy(src,cand,sc){
  const same=[],diff=[];
  (src.g===cand.g?same:diff).push(src.g===cand.g?'same garment type':'different garment');
  (src.f===cand.f?same:diff).push(src.f===cand.f?`same ${src.f.toLowerCase()}`:`${cand.f.toLowerCase()} vs ${src.f.toLowerCase()}`);
  if(src.colors.some(c=>cand.colors.includes(c)))same.push('overlapping palette'); else diff.push('different palette');
  if(Math.abs(src.price-cand.price)<=60)same.push('close price'); else diff.push(`€${cand.price} vs €${src.price}`);
  return `Same ${same.slice(0,2).join(' and ')||'category'}. Differs on ${diff.slice(0,2).join(' and ')||'minor details'}.`;
}
function vsResults(){
  if(!vsSource)return [];
  const src=vsSource;
  let res=CATALOG.filter(p=>p.style!==src.style).map(p=>{
    const sc=vsScore(src,p);const aff=vsBrandAffinity(p);
    // the active region picks which real dimension drives the headline match
    const regionScore={whole:sc.overall,silhouette:sc.garment,fabric:sc.fabric,colour:sc.colour,price:sc.price}[vsRegion];
    return {p,sc,aff,head:Math.round(regionScore),why:vsMatchWhy(src,p,sc)};
  });
  const rankers={
    visual:(a,b)=>b.head-a.head,
    brandaffinity:(a,b)=>b.aff-a.aff,
    fabric:(a,b)=>b.sc.fabric-a.sc.fabric,
    recent:(a,b)=>a.p.weeks-b.p.weeks // fewer weeks live = more recent
  };
  return res.sort(rankers[vsRank]||rankers.visual);
}
// internal overlap: how many of YOUR OWN styles are close on garment type + fabric.
// This is repetition-within-the-archive, not market saturation (we don't ingest the market).
function vsOverlap(src){
  const near=CATALOG.filter(p=>p.style!==src.style&&vsScore(src,p).garment>=70&&vsScore(src,p).fabric>=60);
  const level=near.length>=3?['High','var(--clay)']:near.length>=1?['Some','var(--ochre)']:['Low','var(--sage)'];
  return {near,level};
}

function renderVisualSearch(seed){
  const host=document.getElementById('view-products');
  if(seed&&CATALOG.find(p=>p.style===seed||p.n===seed))vsSource=CATALOG.find(p=>p.style===seed||p.n===seed);
  const src=vsSource;
  const results=vsResults();
  const overlap=src?vsOverlap(src):null;
  host.innerHTML=`
    <div class="vh"><div><div class="eyebrow">Design precedent · your catalog</div><h1>Visual search</h1><p>Pick a style — Atelier finds its closest precedents in your own archive, scores the resemblance on the attributes it can actually read, and flags how much your own catalog already overlaps it.</p></div>
      <span class="dq ${src?'high':'med'}" onclick="openEvidence('catalog similarity model')"><span class="d"></span>Similarity model · ${src?'over '+CATALOG.length+' styles':'pick a source'}</span></div>
    <div class="vsearch">
      <div class="vsbox">
        <div class="eyebrow" style="margin-bottom:8px">Source style</div>
        ${src?`<div class="vs-source">
          <div class="vs-source-img">${mtile({color:src.colors[0],fabric:src.f,garmentKey:src.g,img:src.img})}</div>
          <div class="vs-source-meta"><div class="vss-name">${src.n}</div><div class="vss-sub">${src.cat} · ${src.gd} · €${src.price}</div>
          <div class="vss-attrs">${[src.g,src.f,colName(src.colors[0])].map(a=>`<span>${a}</span>`).join('')}</div></div>
          <button class="vs-change" onclick="vsSource=null;renderVisualSearch()">Change</button>
        </div>`:`<div class="vs-pick"><p>Choose any style to search from:</p><div class="vs-pickgrid">${CATALOG.slice(0,6).map(p=>`<button class="vs-pickitem" onclick="vsSource=CATALOG.find(x=>x.style==='${p.style}');renderVisualSearch()"><div class="vs-pi-img">${mtile({color:p.colors[0],fabric:p.f,garmentKey:p.g,img:p.img})}</div><span>${p.n}</span></button>`).join('')}</div><button class="btn ghost" style="width:100%;margin-top:10px" onclick="go('catalog')">Browse full catalog →</button></div>`}
        ${src?`<div class="field" style="margin-top:16px"><label class="eyebrow" style="display:block;margin-bottom:8px">Match on</label><div class="region-chips">${[['whole','Overall'],['silhouette','Garment type'],['fabric','Fabric'],['colour','Colour'],['price','Price']].map(([k,l])=>`<button class="rchip ${vsRegion===k?'on':''}" onclick="vsRegion='${k}';renderVisualSearch()">${l}</button>`).join('')}</div><div class="vs-region-note">Atelier scores only what the catalog records — garment type, fabric, colour, price. Neckline, construction and proportion aren't tagged, so they aren't scored.</div></div>
        <div class="field" style="margin-top:16px"><label class="eyebrow" style="display:block;margin-bottom:8px">Archive overlap</label>
          <div class="vs-risk" style="border-color:${overlap.level[1]}"><div class="vsr-level" style="color:${overlap.level[1]}">${overlap.level[0]} internal overlap</div><div class="vsr-detail">${overlap.near.length} of your own style${overlap.near.length===1?'':'s'} share this garment type & fabric${overlap.near.length?' — a successor risks repeating the archive':' — this is a distinct direction in your line'}.</div></div>
          <div class="vs-region-note">Overlap is measured within <b>your catalog only</b>, not the market — it flags repetition, not saturation.</div></div>
        <div class="vs-scope-note">Searching <b>your catalog</b>. Market, competitor and resale scopes need external data Atelier doesn't yet ingest — shown honestly rather than faked.</div>`:''}
      </div>
      <div>
        ${src?`<div class="vs-resbar"><div class="eyebrow">${results.length} precedents · ranked by ${{visual:'closest overall',brandaffinity:'brand affinity',fabric:'fabric',recent:'most recent'}[vsRank]}</div>
          <div class="vs-ranks">${[['visual','Closest'],['fabric','Fabric'],['brandaffinity','Brand affinity'],['recent','Most recent']].map(([k,l])=>`<button class="vsr-tab ${vsRank===k?'on':''}" onclick="vsRank='${k}';renderVisualSearch()">${l}</button>`).join('')}</div></div>
        <div class="simgrid">${results.map(r=>vsCard(r,src)).join('')}</div>`:`<div class="vs-empty"><div style="font-size:26px;margin-bottom:10px">⌖</div><h3>Pick a source style to begin</h3><p>Atelier surfaces the closest precedents in your archive, each with an inspectable score on the attributes it can actually read — garment type, fabric, colour and price — plus a heuristic brand-affinity read, and tells you how much your own line already overlaps the design.</p></div>`}
      </div>
    </div>
    ${vsCompare.length?`<div class="vs-comptray"><span class="vsc-label">${vsCompare.length} selected</span>${vsCompare.map(s=>`<span class="vsc-chip">${CATALOG.find(p=>p.style===s).n}<button onclick="vsCompare=vsCompare.filter(x=>x!=='${s}');renderVisualSearch()">×</button></span>`).join('')}<button class="btn" onclick="vsOpenCompare()">Compare ${vsCompare.length} →</button></div>`:''}`;
}
function vsCard(r,src){
  const{p,sc,aff,why}=r;
  const sel=vsCompare.includes(p.style);
  return `<div class="simcard vs-card2">
    <div class="sf" onclick="openStyle('${p.style}')">${mtile({color:p.colors[0],fabric:p.f,garmentKey:p.g,img:p.img})}<span class="pct">${r.head}%</span>
      <button class="vs-cmp ${sel?'on':''}" onclick="event.stopPropagation();vsToggleCompare('${p.style}')" title="Add to compare">${sel?'✓':'+'}</button></div>
    <div class="sm">
      <div class="nm">${p.n}</div>
      <div class="vs-meta2">${p.cat} · €${p.price} · ${p.st}% ST</div>
      <div class="vs-scores">
        ${[['Garment',sc.garment],['Fabric',sc.fabric],['Colour',sc.colour],['Brand aff.',aff]].map(([l,v])=>`<div class="vss-row"><span class="vss-l">${l}</span><span class="vss-bar"><i style="width:${v}%;background:${v>=80?'var(--sage)':v>=55?'var(--ochre)':'var(--clay)'}"></i></span><span class="vss-v">${v}</span></div>`).join('')}
      </div>
      <div class="vs-why">${why}</div>
      <button class="vs-studio" onclick="event.stopPropagation();vsToStudio('${p.style}')">Use as reference in Studio →</button>
    </div>
  </div>`;
}
function vsToStudio(styleId){
  const p=CATALOG.find(x=>x.style===styleId);if(!p)return;
  const src=vsSource;
  go('studio');setStudioPane&&setStudioPane('gen');
  // transfer ACTUAL reference context into the generator's state
  if(typeof gen==='object'){
    gen.gender=p.gd;
    gen.category=p.cat==='Denim'?'Trousers':p.cat;
    gen.garment=p.g;
    gen.fabric=(typeof FAB_TEX!=='undefined'&&FAB_TEX[p.f])?p.f:gen.fabric;
    gen.colors=p.colors.slice(0,3);
    const overlap=vsOverlap(p);
    const dir=`Reference: ${p.n} (${p.cat}, ${p.f}, ${colName(p.colors[0])}). ${overlap.near.length?`${overlap.near.length} near-overlaps in the archive — differentiate the new design.`:'Distinct in the line — push the direction further.'}`;
    const di=document.getElementById('dirInput');if(di)di.value=dir;
    syncGenUI&&syncGenUI();
  }
  toast(p.n+' loaded into Studio as reference');
}
window.vsToStudio=vsToStudio;
function vsToggleCompare(styleId){vsCompare=vsCompare.includes(styleId)?vsCompare.filter(x=>x!==styleId):[...vsCompare,styleId].slice(0,4);renderVisualSearch();}
window.vsToggleCompare=vsToggleCompare;
function vsOpenCompare(){
  if(vsCompare.length<2){toast('Pick at least 2 to compare');return;}
  const src=vsSource;const items=vsCompare.map(s=>CATALOG.find(p=>p.style===s));
  const rows=[['Garment type',p=>p.g],['Category',p=>p.cat],['Fabric',p=>p.f],['Lead colour',p=>colName(p.colors[0])],['Price',p=>'€'+p.price],['Sell-through',p=>p.st+'%'],['Brand affinity',p=>vsBrandAffinity(p)]];
  openDrawer(`<div class="dr-card">
    <div class="ey" style="color:var(--cobalt)">Compare precedents</div>
    <h2 style="font-size:21px">${src?'vs '+src.n:'Comparison'}</h2>
    <div class="vs-comptable"><table><thead><tr><th>Attribute</th>${src?`<th class="vsct-ref">${src.n.split(' ').slice(0,2).join(' ')}</th>`:''}${items.map(p=>`<th>${p.n.split(' ').slice(0,2).join(' ')}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([l,fn])=>`<tr><td class="vsct-attr">${l}</td>${src?`<td class="vsct-ref">${fn(src)}</td>`:''}${items.map(p=>`<td>${fn(p)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    ${src?`<div class="vs-compinterp">${(()=>{const best=items.slice().sort((a,b)=>vsBrandAffinity(b)-vsBrandAffinity(a))[0];return `<b>${best.n}</b> reads as the most Meridian-like of these — highest brand affinity (${vsBrandAffinity(best)}) and a close price position. Affinity is a heuristic read of returns, price band and category, not a tagged DNA match.`;})()}</div>`:''}
    <button class="btn" style="margin-top:16px" onclick="closeDrawer()">Done</button>
  </div>`);
}
window.vsOpenCompare=vsOpenCompare;window.renderVisualSearch=renderVisualSearch;
let wsSel=null, wsMode='map';
function wsRanked(){return [...WHITESPACE].map(w=>({...w,score:Math.round(w.x*0.5+(100-w.y)*0.32+w.r*0.6)})).sort((a,b)=>b.score-a.score);}
function wsReason(w){return w.y<=40?`High demand, thin competitor supply — the room worth taking.`:w.x>=70?`Real demand but the set is already crowding in — move fast or differentiate.`:`Quieter pocket; watch rather than buy.`;}
function renderWhitespace(){
 const ranked=wsRanked();const topNames=ranked.slice(0,3).map(r=>r.name);
 if(!wsSel)wsSel=ranked[0].name;
 document.getElementById('wmapDots').innerHTML=ranked.map((w,i)=>`<div class="dotw ${w.name===wsSel?'sel':''}" data-n="${w.name}" style="left:${w.x}%;top:${w.y}%"><div class="bubble" style="width:${w.r}px;height:${w.r}px;background:${w.c}"></div><span class="lab ${topNames.includes(w.name)?'always':''}">${w.name}</span></div>`).join('');
 document.getElementById('wrank').innerHTML=ranked.map((w,i)=>`<div class="wrow ${w.name===wsSel?'sel':''}" data-n="${w.name}"><span class="rk">${i+1}</span><span class="th">${mtile({color:w.c,fabric:w.f,garmentKey:w.g,img:photoFor(w.g,'Romantic','women')})}</span><div><div class="wn">${w.name}</div><div class="wd">${w.cat} · ${w.price} · ${wsReason(w)}</div></div><span class="wmetric">demand<b>${w.x}</b></span><span class="wmetric">supply<b style="color:${w.y<=40?'var(--sage)':'var(--ochre)'}">${w.y<=40?'low':'mid'}</b></span></div>`).join('');
 document.getElementById('wtable').innerHTML=`<tr><th>#</th><th>Opportunity</th><th>Category</th><th>Price</th><th>Demand</th><th>Supply</th><th>Opp score</th><th></th></tr>`+ranked.map((w,i)=>`<tr data-n="${w.name}" style="cursor:pointer"><td>${i+1}</td><td class="${w.y<=40?'hot':''}">${w.name}</td><td>${w.cat}</td><td>${w.price}</td><td>${w.x}</td><td>${w.y<=40?'Low':'Mid'}</td><td><b>${w.score}</b></td><td><button class="link" onclick="event.stopPropagation();wsEvaluate('${w.name.replace(/'/g,"\\'")}')">Evaluate →</button></td></tr>`).join('');
 wsBindRows();
 const sel=ranked.find(r=>r.name===wsSel)||ranked[0];
 renderRail('railWhitespace',{see:`Selected: <b>${sel.name}</b> — ${sel.cat} at ${sel.price}. ${wsReason(sel)}`,why:`Demand index ${sel.x}/100 against ${sel.y<=40?'low':'moderate'} competitor supply. Opportunity score ${sel.score}.`,rec:sel.y<=40?'Evaluate as an opportunity, then brief it before any design work.':'Evaluate carefully — the silhouette is crowding; differentiation matters.',acts:[['Evaluate this opportunity',()=>{wsEvaluate(sel.name);}],['Create brief',()=>{openBrief(sel.name);}]]});
}
// route whitespace items into the canonical opportunity drawer where a matching trend exists,
// otherwise straight to the brief — never raw to Studio or counted as a collection style.
function wsEvaluate(name){
  const t=TRENDS.find(x=>x.name===name||x.name.includes(name)||name.includes(x.name));
  if(t&&typeof openOpp==='function'){if(typeof lastHeroForScore!=='undefined')lastHeroForScore=t;openOpp(t.name);}
  else{openBrief(name);}
}
window.wsEvaluate=wsEvaluate;
function wsBindRows(){
 document.querySelectorAll('#wmapDots .dotw, #wrank .wrow, #wtable tr[data-n]').forEach(el=>el.addEventListener('click',()=>{wsSel=el.dataset.n;renderWhitespace();}));
}
function wsSetMode(m){wsMode=m;document.getElementById('wmapView').style.display=m==='map'?'':'none';document.getElementById('wlistView').style.display=m==='list'?'':'none';document.querySelectorAll('#wmapMode button').forEach(b=>b.classList.toggle('on',b.dataset.m===m));}
function renderReports(){
 const banner=`<div class="obj-banner" style="grid-column:1/-1"><span class="ob-dot"></span><b>Each report is generated from a live Atelier object</b> — an opportunity, a collection review, or your consumer DNA — not a generic feed. The provenance is shown on every card.</div>`;
 document.getElementById('repList').innerHTML=banner+REPORTS.map((r,i)=>`<div class="report" data-i="${i}"><div class="rimg">${mtile({color:r.c,fabric:r.f,garmentKey:r.g})}<span class="kind ${r.kind}">${r.k}</span></div><div class="rb"><h4>${r.t}</h4><p>${r.p}</p><div class="rep-from">↳ ${r.from}</div><div class="meta"><span>${r.market}</span><span>${r.read} read</span></div></div><button class="apply" data-i="${i}">✦ What does this mean for Meridian? →</button></div>`).join('');
 document.querySelectorAll('#repList .apply').forEach(b=>b.addEventListener('click',e=>{e.stopPropagation();openAssistant('What does "'+REPORTS[+b.dataset.i].t+'" mean for Meridian?');}));
}
function renderAlerts(){
 document.getElementById('inbox').innerHTML=ALERTS.map(a=>`<div class="alert ${a.lv}"><span class="lv">${a.k}</span><div class="ab"><h4>${a.t}</h4><p>${a.p}</p><div class="why">${a.why.map(w=>`<span>${w[0]}: <b>${w[1]}</b></span>`).join('')}</div><div class="sug">→ ${a.sug}</div></div><div class="acts"><button onclick="openEvidence('${a.ev}')">Evidence</button><button onclick="toast('Sent to team')">Send</button><button onclick="toast('Snoozed')">Snooze</button></div></div>`).join('');
}
let boardShowArchived=false;
function renderBoards(){
 const all=BOARD_ORDER.flatMap(c=>BOARD[c]||[]);
 const blocked=all.filter(x=>x.blocker).length;
 const awaitingReview=all.filter(x=>x.review).length;
 const active=all.length;
 // pipeline health — operational, not generic column counts
 const health=`<div class="pipe-health">
   <div class="ph-stat"><span class="ph-v">${active}</span><span class="ph-l">active projects</span></div>
   <div class="ph-stat"><span class="ph-v" style="color:${blocked?'var(--clay)':'var(--ink)'}">${blocked}</span><span class="ph-l">blocked</span></div>
   <div class="ph-stat"><span class="ph-v" style="color:${awaitingReview?'var(--ochre)':'var(--ink)'}">${awaitingReview}</span><span class="ph-l">awaiting review</span></div>
   <div class="ph-stat"><span class="ph-v">${(BOARD.Sample||[]).length}</span><span class="ph-l">in sampling</span></div>
   <div class="ph-note">Each card is one development project, carried from its source opportunity through to approval — not a separate copy.</div>
 </div>`;
 const cols='<div class="boardcols-inner">'+BOARD_ORDER.map(col=>{const items=BOARD[col]||[];
   return `<div class="bcol"><div class="bh">${col}<span class="n">${items.length}</span></div>${items.map(it=>boardCard(it,col)).join('')||'<div class="bcol-empty">—</div>'}</div>`;
 }).join('')+'</div>';
 const archived=boardShowArchived?`<div class="board-archived"><div class="eyebrow" style="margin:18px 0 10px">Archived / cancelled</div>${BOARD_ARCHIVED.map(it=>`<div class="bchip archived"><div class="bf">${mtile({color:it.c,fabric:it.f,garmentKey:it.g,img:photoFor(it.g,'Minimal',(it.gd||'women').toLowerCase())})}</div><div class="bt">${it.n}<small>${it.reason}</small></div></div>`).join('')}</div>`:'';
 document.getElementById('boardCols').innerHTML=health+`<div class="board-toolbar"><button class="link" onclick="boardShowArchived=!boardShowArchived;renderBoards()">${boardShowArchived?'Hide':'Show'} archived (${BOARD_ARCHIVED.length}) →</button></div>`+cols+archived;
}
function boardCard(it,stage){
 const incomplete=!it.owner||!it.due||it.due==='—'&&stage!=='Approved';
 return `<div class="bchip" onclick="openDevProject('${it.n.replace(/'/g,"\\'")}','${stage}')">
   <div class="bf">${mtile({color:it.c,fabric:it.f,garmentKey:it.g,img:photoFor(it.g,'Minimal',(it.gd||'women').toLowerCase())})}${it.blocker?'<span class="bf-block" title="Blocked">⚠</span>':''}</div>
   <div class="bt">${it.n}<small>${it.gd} · ${it.cat}</small></div>
   <div class="bcard-meta">
     <span class="bcm">${it.owner||'<i style="color:var(--clay)">no owner</i>'}</span>
     <span class="bcm">${it.due&&it.due!=='—'?'Due '+it.due:stage==='Approved'?'Approved':'<i style="color:var(--clay)">no date</i>'}</span>
   </div>
   ${it.blocker?`<div class="bcard-block">⚠ ${it.blocker}</div>`:''}
   ${it.review?`<div class="bcard-review">${it.review}</div>`:''}
   <div class="bcard-src">↳ ${it.src}</div>
 </div>`;
}
function openDevProject(name,stage){
 const it=BOARD_ORDER.flatMap(c=>(BOARD[c]||[]).map(x=>({...x,stage:c}))).find(x=>x.n===name);
 if(!it){toast('Project not found');return;}
 // open the actual object: if approved + has a brief, open the brief; otherwise the project card
 const html=`<div class="dr-card" style="margin-top:8px">
   <div class="ey" style="color:var(--cobalt)">Development project · ${it.src}</div>
   <h2 style="font-size:22px;margin-bottom:4px">${it.n}</h2>
   <div style="font-family:var(--d);font-size:11px;color:var(--ink-3);margin-bottom:16px">${it.gd} · ${it.cat} · stage: <b>${it.stage}</b></div>
   <div class="dp-grid">
     ${[['Owner',it.owner||'Unassigned'],['Due',it.due||'—'],['Source',it.src],['Stage',it.stage]].map(([k,v])=>`<div class="dp-cell"><div class="dp-k">${k}</div><div class="dp-v">${v}</div></div>`).join('')}
   </div>
   ${it.blocker?`<div style="background:var(--clay-wash);color:var(--clay);border-radius:9px;padding:11px 13px;font-size:12.5px;margin:14px 0"><b>Blocked:</b> ${it.blocker}</div>`:''}
   ${it.review?`<div style="background:var(--ochre-wash);color:var(--ochre);border-radius:9px;padding:11px 13px;font-size:12.5px;margin:14px 0"><b>Review:</b> ${it.review}</div>`:''}
   <div class="dr-sec" style="border-top:1px solid var(--hair);padding-top:16px;margin-top:8px">
     <p style="font-size:11.5px;color:var(--ink-3);line-height:1.5;margin:0 0 14px">This project carries its full lineage — opportunity → brief → concept → development. Governed stage transitions, comments and approval requests would attach here once team accounts and PLM are connected.</p>
     <div style="display:flex;gap:8px;flex-wrap:wrap">
       <button class="btn" onclick="openBrief('${it.n.replace(/'/g,"\\'")}')">Open linked brief</button>
       <button class="btn ghost" onclick="closeDrawer()">Close</button>
     </div>
   </div>
 </div>`;
 openDrawer(html);
}
window.openDevProject=openDevProject;window.renderBoards=renderBoards;

/* ===== evidence drawer ("how this was calculated") ===== */
function openEvidence(topic){
 const html=`<div class="dr-card" style="margin-top:8px"><div class="ey" style="color:var(--cobalt)">How this was calculated</div><h2 style="font-size:24px;text-transform:capitalize">${topic}</h2>
   <div class="readiness" style="background:var(--night-2)"><div class="rnum" style="color:#8fce9f">High</div><div class="rt"><b>Confidence</b><br>strong coverage, fresh data, multiple corroborating sources</div></div></div>
  <div class="dr-sec"><div class="sh"><span class="dot" style="background:var(--cobalt)"></span><h3>Signal weighting</h3></div>
   <div class="calc-bar"><span class="cl">Ecommerce data</span><span class="ct"><i style="width:40%"></i></span><span class="cv">40%</span></div>
   <div class="calc-bar"><span class="cl">Social signals</span><span class="ct"><i style="width:20%;background:var(--ember)"></i></span><span class="cv">20%</span></div>
   <div class="calc-bar"><span class="cl">Search</span><span class="ct"><i style="width:15%;background:var(--ochre)"></i></span><span class="cv">15%</span></div>
   <div class="calc-bar"><span class="cl">Competitors</span><span class="ct"><i style="width:15%;background:var(--sage)"></i></span><span class="cv">15%</span></div>
   <div class="calc-bar"><span class="cl">Historical</span><span class="ct"><i style="width:10%;background:var(--ink-3)"></i></span><span class="cv">10%</span></div></div>
  <div class="dr-sec"><div class="sh"><span class="dot" style="background:var(--sage)"></span><h3>Why it's moving</h3></div>
   <div class="evi-row"><span class="ei">↑</span><span>More brands in the set incorporated it across recent drops</span></div>
   <div class="evi-row"><span class="ei">↑</span><span>Search and resale interest rose over the last 90 days</span></div>
   <div class="evi-row"><span class="ei">↑</span><span>Engagement on related social posts outpaced category average</span></div></div>
  <div class="dr-sec"><div class="sh"><span class="dot" style="background:var(--ochre)"></span><h3>What could invalidate it</h3></div>
   <div class="evi-row"><span class="ei">⚠</span><span>Internal conversion on similar pieces stays low</span></div>
   <div class="evi-row"><span class="ei">⚠</span><span>Growth is concentrated on a single platform</span></div>
   <p style="font-size:11.5px;color:var(--ink-3);font-style:italic;margin:12px 0 0">Observed signals are separated from estimated ones. We report tracked sources — never the whole market.</p></div>`;
 openDrawer(html);
}
window.openEvidence=openEvidence;

/* ===== contextual rail ===== */
function renderRail(id,cfg){const el=document.getElementById(id);if(!el)return;
 el.innerHTML=`<div class="rcard"><h4><span class="d" style="background:var(--cobalt)"></span>What you're seeing</h4><p>${cfg.see}</p></div>
  <div class="rcard"><h4><span class="d" style="background:var(--ember)"></span>Why it matters</h4><p>${cfg.why}</p></div>
  <div class="rcard"><h4><span class="d" style="background:var(--sage)"></span>Recommended</h4><p>${cfg.rec}</p><div class="ract"></div></div>`;
 const wrap=el.querySelector('.ract');cfg.acts.forEach(a=>{const b=document.createElement('button');b.innerHTML='→ '+a[0];b.addEventListener('click',a[1]);wrap.appendChild(b);});
}

/* ===== assistant ===== */
function asstAnswer(q){
 const map={
  default:{a:[`Reading your live data and the signals in your market, the clearest move is sheer rib knit: ${'96'}/100 brand fit, accelerating demand, and no entry in your current line. Your set is already moving on it.`,'Sizing a small capsule keeps risk low while the window is open.'],src:['Shopify · 30d','Competitors · 4 brands','Social · saves','Brand DNA'],conf:'High'},
 };
 const a=map.default;
 return `<div class="asst-ans"><div class="ut">${q}</div>${a.a.map(p=>`<p>${p}</p>`).join('')}<div class="asst-src">${a.src.map(s=>`<span class="s">${s}</span>`).join('')}<span class="s" style="color:var(--sage);border-color:var(--sage)">Confidence: ${a.conf}</span></div><div class="asst-acts"><button onclick="closeDrawer();openBrief('Sheer rib knit')">＋ Create Brief from this</button><button onclick="toast('Sheer rib knit added to your watchlist')">Add to watchlist</button><button onclick="closeDrawer();go('studio')">Compare concepts</button><button onclick="asstReject()">Record rejection</button></div></div>`;
}
function asstReject(){
  openDrawer(`<div class="dr-card">
    <div class="ey" style="color:var(--cobalt)">Record a rejection</div>
    <h2 style="font-size:21px">Why isn't this right for Meridian?</h2>
    <p style="font-size:12.5px;color:#cfccbf;margin:-4px 0 14px">Recording why teaches Atelier — it will weight similar recommendations down next time.</p>
    <div class="opts" style="flex-direction:column;gap:7px;display:flex">
      ${['Already covered in the collection','Outside our brand codes','Wrong price tier for us','Timing — not this season','Tried before, underperformed'].map(r=>`<button class="opt" style="text-align:left;width:100%" onclick="logDecision('Rejected','${r}')">${r}</button>`).join('')}
    </div>
  </div>`);
}
window.asstReject=asstReject;
function openAssistant(seed){
 const qs=SUGGEST[currentRole]||SUGGEST.creative;
 const html=`<div class="asst-head"><div class="ai-ic"><svg width="18" height="18" viewBox="0 0 24 24" stroke="#fff" stroke-width="2" fill="none"><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/></svg></div><h2>Ask Atelier</h2><p>It won't just tell you what's trending — it tells you what it means for Meridian, and whether to act. Brand-aware, honest about confidence, every answer traceable.</p></div>
  <div class="eyebrow" style="margin-bottom:10px">Suggested for ${ROLES[currentRole].title}</div>
  <div id="asstQs">${qs.map(q=>`<div class="asst-q" data-q="${q.replace(/"/g,'&quot;')}">${q}<span class="ar">→</span></div>`).join('')}</div>
  <div id="asstThread">${seed?asstAnswer(seed):''}</div>
  <div class="asst-input"><input id="asstIn" placeholder="Ask anything about your market or collection…"><button id="asstSend"><svg width="16" height="16" viewBox="0 0 24 24" stroke="#fff" stroke-width="2" fill="none"><path d="M4 12h16M14 6l6 6-6 6"/></svg></button></div>`;
 openDrawer(html);
 const ask=q=>{document.getElementById('asstThread').innerHTML=asstAnswer(q);document.getElementById('drawer').scrollTo({top:9999,behavior:'smooth'});};
 document.querySelectorAll('#asstQs .asst-q').forEach(b=>b.addEventListener('click',()=>ask(b.dataset.q)));
 const send=()=>{const v=document.getElementById('asstIn').value.trim();if(v){ask(v);document.getElementById('asstIn').value='';}};
 document.getElementById('asstSend').addEventListener('click',send);
 document.getElementById('asstIn').addEventListener('keydown',e=>{if(e.key==='Enter')send();});
}
window.openAssistant=openAssistant;

/* ===== v5 data ===== */
const DNA_CORE={
  visual:['Bias cut','Tonal palette','Clean column silhouette','Fluid drape','Architectural proportion','Minimal surface detail'],
  product:['Trousers (hero)','Slip dresses (core)','Knitwear (core)','Outerwear (seasonal)','Tops (supporting)'],
  codes:['Minimal','Architectural','Tonal','Japanese-influenced'],
  forbidden:['Logomania','Excessive embellishment','Neon palette','Fast-fashion fabrication']
};
// Provenance for each detected code — this is what makes Brand DNA credible rather than AI-generated.
// detected: % of historical catalog showing the code · status: team-confirmed/rejected/unconfirmed
// perf: where it performs commercially · history: accept/reject record on briefs
const DNA_PROV=[
  {code:'Tonal palette',group:'Visual',detected:81,status:'confirmed',perf:'Strongest in trousers & knitwear (78–88% ST)',history:'Accepted on 9 briefs · never rejected',evidence:'Detected in 81% of catalog colourways'},
  {code:'Bias cut',group:'Visual',detected:42,status:'confirmed',perf:'Defines the slip-dress franchise',history:'Accepted on 4 briefs · core to 1 hero style',evidence:'Detected in 42% of dresses & skirts'},
  {code:'Architectural proportion',group:'Visual',detected:64,status:'confirmed',perf:'Strong in tailoring; premium-band anchor',history:'Accepted on 6 briefs · gaining over 4 seasons',evidence:'Detected in 64% of tailoring & outerwear'},
  {code:'Minimal surface detail',group:'Visual',detected:88,status:'confirmed',perf:'Universal — lowest return rate when held',history:'Never rejected · brand-wide guardrail',evidence:'Detected in 88% of all products'},
  {code:'Fluid drape',group:'Visual',detected:37,status:'unconfirmed',perf:'Mixed — strong in dresses, weak in tailoring',history:'Accepted twice, rejected once for main',evidence:'Detected in 37% of products — confirm scope'},
  {code:'Trousers (hero)',group:'Product',detected:22,status:'confirmed',perf:'Highest full-price ST in the line (92%)',history:'Core franchise · expanded every season',evidence:'22% of catalog, 31% of revenue'},
  {code:'Knitwear (core)',group:'Product',detected:19,status:'confirmed',perf:'Reliable but margin-light below €180',history:'Rejected twice above €180 — ceiling untested',evidence:'19% of catalog · price ceiling flagged'},
  {code:'Japanese-influenced',group:'Code',detected:34,status:'unconfirmed',perf:'Hard to measure — aesthetic, not commercial',history:'Team-described, not yet data-confirmed',evidence:'Inferred from 34% of silhouettes — low confidence'},
];
const DNA_COMMERCIAL={
  priceArch:[{cat:'Trousers',lo:220,hi:380,avg:290,st:78},{cat:'Dresses',lo:180,hi:480,avg:340,st:71},{cat:'Knitwear',lo:160,hi:340,avg:240,st:63},{cat:'Outerwear',lo:420,hi:680,avg:540,st:58},{cat:'Tops',lo:120,hi:240,avg:172,st:69}],
  margin:62,bestAttrs:['Satin','Bias cut','Tonal','Wide leg'],
  drivers:['Full-price sell-through above 72% on dresses and trousers','Knitwear drags blended margin 4 pts below target','Outerwear builds brand perception even at lower velocity']
};
const DNA_CONSUMER={
  cohorts:[{n:'Core creative',pct:38,desc:'Design-literate urban women 28–38, repeat buyers, full-price. Build the collection around them.',tag:'High value'},{n:'Aspirational professional',pct:29,desc:'Men 30–45 expanding beyond basics. Entry via trousers and knits, converts to outerwear.',tag:'Growing'},{n:'Gift & occasion',pct:18,desc:'Buys once for specific events. Price-sensitive. Important for awareness, low loyalty.',tag:'Watch'},{n:'Kids extension',pct:15,desc:'Parent of core creative. Smaller AOV. Validates brand family positioning.',tag:'Emerging'}],
  motives:['Fabric quality and hand-feel over brand logos','Investment pieces with long wear cycles','Architectural proportion and quiet distinctiveness'],
  returnReasons:['Sizing inconsistency in knitwear (22%)','Length expectation on dresses (18%)','Colour difference from photography (14%)']
};
const DECISION_HISTORY=[
 {id:1,date:'Jun 2026',title:'Sheer rib knit capsule',rec:'Make · 3 SKUs for AW26',decision:'accepted',why:'Aligned with signals and competitor gap',outcome:'testing',outcomeVal:'→ sampling',outcomeClass:'warn',img:IMG.knit,learn:'First knitwear move above €180 price point — testing consumer ceiling'},
 {id:2,date:'May 2026',title:'Barrel jean in washed indigo',rec:'Make · 4 SKUs for SS26',decision:'modified',why:'Changed from 4 SKUs to 2 — limited production capacity',outcome:'testing',outcomeVal:'→ in dev',outcomeClass:'warn',img:IMG.mentrouser,learn:'Reduced depth preserves margin; can extend if SS26 pre-orders confirm'},
 {id:3,date:'Apr 2026',title:'Oversized puffer jacket',rec:'Make · trend accelerating',decision:'rejected',why:'Off-brand aesthetic — conflicts with architectural code',outcome:'pending',outcomeVal:'Not launched',outcomeClass:'miss',img:IMG.tailor,learn:'Atelier should weight architectural guardrail more heavily vs momentum score'},
 {id:4,date:'Mar 2026',title:'Bias-cut slip dress — ivory',rec:'Scale existing SKU to 3 colorways',decision:'accepted',why:'92% sell-through on ink version confirmed demand',outcome:'good',outcomeVal:'88% ST',outcomeClass:'good',img:IMG.slip,learn:'Colorway extensions on proven silhouettes outperform new silhouettes'},
 {id:5,date:'Feb 2026',title:'Relaxed camp shirt (Men)',rec:'Test · 2 SKUs in linen',decision:'accepted',why:'Emerging demand in men\'s category',outcome:'good',outcomeVal:'74% ST',outcomeClass:'good',img:IMG.menshirt,learn:'Men\'s entry via fluid fabrication consistent with brand codes'},
];
const TEACH_REASONS=['Too similar to competitors','Off-brand aesthetic','Price point wrong','Production not viable','Timing incorrect','Consumer mismatch','Good signal, wrong category','Creative direction elsewhere'];
const COLL_REVIEW=[
 {action:'keep',img:IMG.slip,name:'Bias slip dress — ink',cat:'Dresses',reason:'88% sell-through, highest brand fit, core DNA. Build deeper.'},
 {action:'keep',img:IMG.mentrouser,name:'Wide trouser — char',cat:'Tailoring',reason:'64% repeat-buyer rate, 78% ST. Extend into two colourways.'},
 {action:'add',img:IMG.sheer,name:'Sheer rib knit',cat:'Knitwear',reason:'Competitor gap + signal acceleration. No current entry. Open window 4–6 weeks.'},
 {action:'diff',img:IMG.sunlit,name:'Bias midi — warm neutral',cat:'Dresses',reason:'Demand clear but 3 direct competitors have similar. Differentiate on fabric weight or detail.'},
 {action:'test',img:IMG.menshirt,name:'Camp shirt — linen',cat:'Tops (Men)',reason:'Early signal. Test 2 SKUs before committing to depth.'},
 {action:'cut',img:IMG.knit,name:'Soft knit cardigan',cat:'Knitwear',reason:'44% ST, margin 38%, discounting every season. Ties up cash. Cut from reorder.'},
 {action:'cut',img:IMG.tailor,name:'Cropped puffer',cat:'Outerwear',reason:'Off-brand aesthetic. Low ST. Pulls brand perception toward high-street.'},
];
const COLL_TABS_DATA=['Line Plan','Signal coverage','Coherence','Market'];
let activeCollTab=0;
const FORECAST_HISTORY=[
 {img:IMG.slip,name:'Bias slip dress demand',detected:'Jan 2026',predicted:'Mar peak',actual:'Feb peak',error:'3 weeks early',tag:'hit',score:91},
 {img:IMG.knit,name:'Translucent knitwear',detected:'Apr 2026',predicted:'Jun window',actual:'→ ongoing',error:'On target',tag:'hit',score:87},
 {img:IMG.mentrouser,name:'Barrel jean surge',detected:'Feb 2026',predicted:'Apr–May',actual:'May',error:'2 weeks late',tag:'hit',score:78},
 {img:IMG.tailor,name:'Oversized puffer',detected:'Nov 2025',predicted:'Dec peak',actual:'Did not peak',error:'False positive',tag:'miss',score:0},
];

/* ===== v5 multi-score engine ===== */
function multiScore(t){const d=t.demand;
  // Market whitespace = inverse of competitor supply (matches), not momentum.
  // High matches = crowded = low whitespace. Low matches = open = high whitespace.
  // matches range is roughly 5–18 in our data. Normalize to 0–100 inverted.
  const supplyPct=Math.min(100,Math.round(t.matches*4.5)); // 17 matches → ~77 crowded
  const whitespace=Math.max(8,Math.round(100-supplyPct));
  const whiteClass=whitespace>=65?'high':whitespace>=40?'med':'low';
  // Differentiation = whitespace × 0.8 + adjacency bonus. High whitespace = you stand apart.
  const diff=Math.max(18,Math.round(whitespace*0.78+8));
  return[
   {k:'Market\nmomentum',v:d.d,bar:'var(--ember)',cls:d.d>=80?'high':d.d>=60?'med':'low'},
   {k:'Consumer\nintent',v:Math.round(d.d*0.88+4),bar:'var(--cobalt)',cls:d.d>=80?'high':'med'},
   {k:'Market\nwhitespace',v:whitespace,bar:'var(--sage)',cls:whiteClass},
   {k:'Brand\nfit',v:d.f,bar:'#c98fa0',cls:d.f>=85?'high':d.f>=70?'med':'low'},
   {k:'Brand\nadjacency',v:Math.max(55,d.f-8),bar:'var(--ink)',cls:d.f>=80?'high':'med'},
   {k:'Differentiation',v:diff,bar:'var(--ochre)',cls:diff>=65?'high':diff>=40?'med':'low'},
   {k:'Commercial\nfit',v:Math.round(d.f*0.85+10),bar:'var(--ember)',cls:d.f>=80?'high':'med'},
   {k:'Execution\nfit',v:Math.min(92,Math.round(d.f*0.7+22)),bar:'var(--sage)',cls:'med'},
   {k:'Timing',v:t.tag==='make'?88:t.tag==='test'?67:45,bar:'var(--cobalt)',cls:t.tag==='make'?'high':t.tag==='test'?'med':'low'},
  ];
}
function confTag(level,type){return `<span class="obs-tag ${type}">${level}</span>`;}

/* ===== v5 Brand DNA Engine ===== */
let activeDnaTab='core';
function renderBrandEngine(){
  const el=document.getElementById('dnaBody');if(!el)return;
  document.querySelectorAll('#dnaTabs button').forEach(b=>b.classList.toggle('on',b.dataset.dt===activeDnaTab));
  if(activeDnaTab==='core') el.innerHTML=renderDnaCore();
  else if(activeDnaTab==='commercial') el.innerHTML=renderDnaCommercial();
  else if(activeDnaTab==='consumer') el.innerHTML=renderDnaConsumer();
  else if(activeDnaTab==='adjacency') el.innerHTML=renderDnaAdjacency();
  else el.innerHTML=renderDnaMemoryTab();
}
function renderDnaCore(){
  const stMap={confirmed:['Team-confirmed','var(--sage)','#EDF3EF'],unconfirmed:['Unconfirmed','var(--ochre)','var(--ochre-wash)'],rejected:['Rejected','var(--clay)','var(--clay-wash)']};
  const codeCards=DNA_PROV.map((c,i)=>{const s=stMap[c.status];return `
    <div class="dna-card">
      <div class="dna-top">
        <div><span class="dna-grp">${c.group}</span><h4 class="dna-code">${c.code}</h4></div>
        <span class="dna-status" style="color:${s[1]};background:${s[2]}">${s[0]}</span>
      </div>
      <div class="dna-detect"><div class="dna-bar"><i style="width:${c.detected}%;background:${c.detected>=70?'var(--sage)':c.detected>=45?'var(--cobalt)':'var(--ochre)'}"></i></div><span class="dna-pct">${c.detected}% of catalog</span></div>
      <div class="dna-prov">
        <div class="dp-row"><span class="dp-k">Evidence</span><span>${c.evidence}</span></div>
        <div class="dp-row"><span class="dp-k">Performance</span><span>${c.perf}</span></div>
        <div class="dp-row"><span class="dp-k">History</span><span>${c.history}</span></div>
      </div>
      <div class="dna-acts">
        <button class="dna-btn" onclick="dnaConfirm(${i})">${c.status==='confirmed'?'✓ Confirmed':'Confirm'}</button>
        <button class="dna-btn ghost" onclick="dnaCorrect(${i})">Correct</button>
      </div>
    </div>`;}).join('');
  return `
    <div style="margin-bottom:14px"><div class="eyebrow" style="margin-bottom:4px">Learned from your catalog · every code is traceable and editable</div><p style="font-size:13px;color:var(--ink-2);margin:0">Atelier detects these codes from your historical products, then your team confirms or corrects them. This is what filters every recommendation — so it's worth keeping honest.</p></div>
    <div class="dna-grid">${codeCards}</div>
    <div class="grid col-2" style="margin-top:18px">
      <div class="card"><div class="head"><div><div class="eyebrow">Guardrails · editable</div><h3>Never / always</h3></div></div>
        <div class="eyebrow" style="margin-bottom:8px;color:var(--clay)">Never use</div><div class="opts" style="margin-bottom:14px">${DNA_CORE.forbidden.map(v=>`<span class="opt on" style="background:var(--clay-wash);border-color:var(--clay);color:var(--clay);cursor:default">${v}</span>`).join('')}</div>
        <div class="eyebrow" style="margin-bottom:8px;color:var(--sage)">Always prioritise</div><div class="opts">${['Fabric quality','Cut precision','Tonal restraint','Architectural line'].map(v=>`<span class="opt on" style="background:#EDF3EF;border-color:var(--sage);color:var(--sage);cursor:default">${v}</span>`).join('')}</div></div>
      <div class="card"><div class="head"><div><div class="eyebrow">Brand narrative</div><h3>The idea</h3></div></div><p style="margin:0;font-size:13px;line-height:1.6;color:var(--ink-2)">Quiet, architectural ready-to-wear for people who dress with intent. Material-literate, logo-indifferent. Fewer, better pieces kept for years.</p><div style="margin-top:12px;font-family:var(--d);font-size:9.5px;color:var(--ink-3)">CONSISTENCY SCORE <b style="color:var(--sage);font-size:13px;font-family:var(--serif);font-weight:500">87%</b> · last 6 collections · <span class="link" onclick="go('decisions')">see how it's measured →</span></div></div>
    </div>`;
}
function dnaConfirm(i){DNA_PROV[i].status='confirmed';renderBrandEngine();toast('"'+DNA_PROV[i].code+'" confirmed by team — now weighted higher in recommendations');}
function dnaCorrect(i){
  const c=DNA_PROV[i];
  openDrawer(`<div class="dr-card">
    <div class="ey" style="color:var(--cobalt)">Correct a brand code</div>
    <h2 style="font-size:21px">${c.code}</h2>
    <p style="font-size:12.5px;color:#cfccbf;margin:-4px 0 14px">Your correction changes how Atelier weights this code in every future recommendation. Detected from ${c.detected}% of your catalog.</p>
    <div class="opts" style="flex-direction:column;gap:7px;display:flex">
      <button class="opt" style="text-align:left;width:100%" onclick="dnaApply(${i},'confirm')">This is core — confirm and weight it up</button>
      <button class="opt" style="text-align:left;width:100%" onclick="dnaApply(${i},'capsule')">Accept for capsules only, not main collection</button>
      <button class="opt" style="text-align:left;width:100%" onclick="dnaApply(${i},'reject')">Not a real code — stop using it</button>
    </div>
  </div>`);
}
function dnaApply(i,choice){
  const c=DNA_PROV[i];
  if(choice==='reject'){c.status='rejected';c.history='Team-rejected · removed from weighting';}
  else if(choice==='capsule'){c.status='unconfirmed';c.history='Accepted for capsules only · not main';}
  else{c.status='confirmed';c.history='Team-confirmed · weighted up';}
  closeDrawer();renderBrandEngine();toast('Updated — "'+c.code+'" correction saved to Brand DNA');
}
window.dnaConfirm=dnaConfirm;window.dnaCorrect=dnaCorrect;window.dnaApply=dnaApply;
function renderDnaCommercial(){return `<div class="grid col-2" style="margin-bottom:18px"><div class="card"><div class="head"><div><div class="eyebrow">Price architecture · Shopify${confTag('CLIENT-PROVIDED','client')}</div><h3>Category performance</h3></div></div>${DNA_COMMERCIAL.priceArch.map(p=>`<div style="display:grid;grid-template-columns:100px 1fr 60px 44px;gap:10px;align-items:center;padding:10px 0;border-top:1px solid var(--hair)"><span style="font-weight:600;font-size:13px">${p.cat}</span><div style="display:flex;gap:4px;align-items:center"><span style="font-family:var(--d);font-size:10px;color:var(--ink-3)">€${p.lo}</span><span style="flex:1;height:7px;background:var(--paper-2);border-radius:3px;overflow:hidden;margin:0 6px;position:relative"><i style="position:absolute;left:${Math.round((p.lo-100)/6)}%;right:${Math.round((680-p.hi)/7)}%;top:0;bottom:0;background:var(--ink);border-radius:3px"></i></span><span style="font-family:var(--d);font-size:10px;color:var(--ink-3)">€${p.hi}</span></div><span style="font-family:var(--d);font-size:11px;font-weight:600">€${p.avg}</span><span style="font-family:var(--d);font-size:11px;font-weight:600;color:${p.st>=70?'var(--sage)':p.st>=55?'var(--ochre)':'var(--clay)'}">${p.st}%</span></div>`).join('')}</div><div style="display:flex;flex-direction:column;gap:16px"><div class="card"><div class="head"><div><div class="eyebrow">Best-performing attributes</div><h3>What sells at full price</h3></div></div><div class="opts">${DNA_COMMERCIAL.bestAttrs.map(a=>`<span class="opt on" style="background:#EDF3EF;border-color:var(--sage);color:var(--sage);cursor:default">${a}</span>`).join('')}</div></div><div class="card"><div class="head"><div><div class="eyebrow">Commercial drivers</div><h3>What the data says</h3></div></div>${DNA_COMMERCIAL.drivers.map(d=>`<div style="display:flex;gap:9px;padding:9px 0;border-top:1px solid var(--hair);font-size:13px;color:var(--ink-2);line-height:1.45"><span style="color:var(--sage);font-weight:700">→</span>${d}</div>`).join('')}</div></div></div>`;}
function renderDnaConsumer(){return `<div class="grid col-2" style="margin-bottom:18px"><div class="card"><div class="head"><div><div class="eyebrow">Consumer cohorts${confTag('CLIENT-PROVIDED','client')}</div><h3>Who actually buys</h3></div></div>${DNA_CONSUMER.cohorts.map(c=>`<div style="padding:13px 0;border-top:1px solid var(--hair)"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px"><span style="font-weight:600;font-size:13.5px">${c.n}</span><span style="font-family:var(--d);font-size:11px;font-weight:700;color:var(--cobalt)">${c.pct}%</span></div><p style="margin:0 0 7px;font-size:12.5px;color:var(--ink-2);line-height:1.4">${c.desc}</p><span class="dec-badge ${c.tag==='High value'?'dec-accepted':c.tag==='Growing'?'dec-testing':c.tag==='Watch'?'dec-modified':'dec-rejected'}">${c.tag}</span></div>`).join('')}</div><div style="display:flex;flex-direction:column;gap:16px"><div class="card"><div class="head"><div><div class="eyebrow">Purchase motivations${confTag('ESTIMATED','estimated')}</div><h3>Why they choose Meridian</h3></div></div>${DNA_CONSUMER.motives.map(m=>`<div style="display:flex;gap:9px;padding:9px 0;border-top:1px solid var(--hair);font-size:13px;color:var(--ink-2)"><span style="color:var(--cobalt);font-weight:700">✦</span>${m}</div>`).join('')}</div><div class="card"><div class="head"><div><div class="eyebrow">Return reasons${confTag('CLIENT-PROVIDED','client')}</div><h3>What to fix</h3></div></div>${DNA_CONSUMER.returnReasons.map(r=>`<div style="display:flex;gap:9px;padding:9px 0;border-top:1px solid var(--hair);font-size:13px;color:var(--ink-2)"><span style="color:var(--clay);font-weight:700">↓</span>${r}</div>`).join('')}</div></div></div>`;}
function renderDnaAdjacency(){return `<div style="margin-bottom:14px"><div class="eyebrow" style="margin-bottom:4px">Where Meridian can go — from its core outward</div><p style="font-size:13px;color:var(--ink-2);margin:0">Atelier uses this map to protect what makes the brand recognisable while identifying where it can evolve without diluting identity.</p></div><div class="adj-map"><div class="adj-zone adj-core"><div class="az-label">Core</div><div class="az-chips">${['Bias slip dress','Wide trouser','Tonal knitwear','Architectural coat'].map(v=>`<span class="az-chip">${v}</span>`).join('')}</div><div style="margin-top:10px;font-size:11px;color:#7a7870">Essential codes. Never compromise.</div></div><div class="adj-zone adj-adjacent"><div class="az-label" style="color:var(--sage)">Adjacent</div><div class="az-chips">${['Sheer rib knit','Camp shirt (fluid)','Barrel jean','Drop-waist skirt'].map(v=>`<span class="az-chip">${v}</span>`).join('')}</div><div style="margin-top:10px;font-size:11px;color:var(--ink-3)">Natural extensions. Opportunity is here now.</div></div><div class="adj-zone adj-experimental"><div class="az-label" style="color:var(--ochre)">Experimental</div><div class="az-chips">${['Denim (premium)','Technical outerwear','Footwear','Home objects'].map(v=>`<span class="az-chip">${v}</span>`).join('')}</div><div style="margin-top:10px;font-size:11px;color:var(--ink-3)">Test carefully. Brand risk is real.</div></div><div class="adj-zone adj-offbrand"><div class="az-label" style="color:var(--clay)">Off-brand</div><div class="az-chips">${['Logo pieces','Fast fabrication','Neon palette','Maximalist print'].map(v=>`<span class="az-chip">${v}</span>`).join('')}</div><div style="margin-top:10px;font-size:11px;color:var(--ink-3)">Avoid. Dilutes identity.</div></div></div><div class="card" style="margin-bottom:18px"><div class="head"><div><div class="eyebrow">Brand drift · last 4 seasons</div><h3>How the codes are evolving</h3></div></div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px"><div><div style="font-family:var(--d);font-size:9.5px;color:var(--sage);letter-spacing:.08em;margin-bottom:6px">GAINING STRENGTH</div>${['Architectural tailoring','Tonal restraint','Unlined structure'].map(v=>`<div style="font-size:12.5px;padding:5px 0;border-top:1px solid var(--hair);display:flex;gap:8px"><span style="color:var(--sage)">↑</span>${v}</div>`).join('')}</div><div><div style="font-family:var(--d);font-size:9.5px;color:var(--ochre);letter-spacing:.08em;margin-bottom:6px">INCONSISTENT</div>${['Knitwear weight','Colour temperature','Kids proportion'].map(v=>`<div style="font-size:12.5px;padding:5px 0;border-top:1px solid var(--hair);display:flex;gap:8px"><span style="color:var(--ochre)">~</span>${v}</div>`).join('')}</div><div><div style="font-family:var(--d);font-size:9.5px;color:var(--ink-3);letter-spacing:.08em;margin-bottom:6px">WEAKENING</div>${['Print exploration','Occasion dressing','Colour contrast'].map(v=>`<div style="font-size:12.5px;padding:5px 0;border-top:1px solid var(--hair);display:flex;gap:8px"><span style="color:var(--ink-3)">↓</span>${v}</div>`).join('')}</div></div></div>`;}
function renderDnaMemoryTab(){return `<div class="card"><div class="head"><div><div class="eyebrow">What Atelier has learned</div><h3>Decision patterns</h3></div></div>${['This brand consistently rejects high-momentum trends when brand fit is below 80 — even if supply is thin.','Adjacent extensions to core DNA outperform new-category bets by 2.1× on full-price sell-through.','Color extensions on proven silhouettes carry 31% lower markdown risk than new silhouette introductions.','Knitwear priced above €180 has not been tested — consumer ceiling is unknown.'].map((l,i)=>`<div style="display:flex;gap:12px;padding:12px 0;border-top:${i?'1px solid var(--hair)':'none'};font-size:13px;line-height:1.5"><span style="font-family:var(--serif);color:var(--cobalt);font-size:18px;font-weight:500;flex:none;margin-top:-2px">✦</span>${l}</div>`).join('')}<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--hair);font-family:var(--d);font-size:10px;color:var(--ink-3)">Based on 47 logged decisions · 23 outcome-tracked · <span class="link" onclick="go('decisions')">View full history →</span></div></div>`;}

/* ===== v5 Decision Memory ===== */
function renderDecisionMemory(){const el=document.getElementById('decisionBody');
  el.innerHTML=`<div class="teach-bar"><div><h3>Teach Atelier</h3><p>Every time you dismiss, modify or reject a recommendation, Atelier learns what this brand actually is — and gets sharper over time.</p></div><div class="teach-btns">${TEACH_REASONS.map(r=>`<button onclick="toast('Atelier noted: '+this.textContent)">${r}</button>`).join('')}</div></div><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px"><div class="eyebrow">47 decisions logged — 23 outcome-tracked</div><div style="font-family:var(--d);font-size:10px;color:var(--ink-3)"><span style="color:var(--sage)">●</span> Accepted &nbsp; <span style="color:var(--cobalt)">●</span> Testing &nbsp; <span style="color:var(--ochre)">●</span> Modified &nbsp; <span style="color:var(--ink-3)">●</span> Rejected</div></div>${DECISION_HISTORY.map(d=>`<div class="dec-item"><div class="di-img">${mtile({color:'#9A968B',fabric:'Satin',garmentKey:'dress',img:d.img})}</div><div><div class="di-date">${d.date}</div><div class="di-title">${d.title}</div><div class="di-why">${d.rec} · ${d.why}</div><div class="di-meta"><span class="dec-badge dec-${d.decision}">${d.decision}</span>${d.learn?`<span style="font-size:11.5px;color:var(--ink-3);font-style:italic;padding:2px 0">Atelier learned: ${d.learn}</span>`:''}</div></div><div class="dec-outcome"><div class="do-num ${d.outcomeClass}">${d.outcomeVal}</div><div class="do-lbl">${d.outcome==='good'?'Sell-through':d.outcome==='testing'?'Status':'Result'}</div></div></div>`).join('')}`;}

/* ===== v5 Collection Review ===== */
function renderCollectionReview(){const el=document.getElementById('collReviewBody');
  // operational, honest metrics — no invented revenue figure
  const metrics=[['27 / 42','Approved','27 of 42 planned styles signed off'],['8','Categories off-plan','target variance across the line plan'],['6','Open decisions','unresolved before sign-off'],['At risk','Jul 3 review','readiness for the next review gate']];
  el.innerHTML=`
    <div class="coll-obj">
      <div class="co-main"><div class="co-name">AW26 Main Collection <span class="co-status">Concept review</span></div>
        <div class="co-sub">42 planned · 27 approved · 6 decisions open · next review Jul 3</div></div>
      <div class="co-fresh">Illustrative data · would sync from Centric PLM + Shopify</div>
    </div>
    <div class="coll-metrics">${metrics.map(([v,l,sub])=>`<div class="card cm-card" title="${sub}"><div class="cm-v">${v}</div><div class="cm-l">${l}</div><div class="cm-sub">${sub}</div></div>`).join('')}</div>
    <div class="coll-tabs" id="collTabs">${COLL_TABS_DATA.map((t,i)=>`<button class="ctab ${i===activeCollTab?'on':''}" onclick="setCollTab(${i})">${t}</button>`).join('')}</div>
    <div id="collTabBody">${renderCollTab(activeCollTab)}</div>`;}
function setCollTab(i){activeCollTab=i;document.querySelectorAll('#collTabs .ctab').forEach((b,j)=>b.classList.toggle('on',j===i));document.getElementById('collTabBody').innerHTML=renderCollTab(i);}window.setCollTab=setCollTab;
function renderCollTab(i){if(i===0)return renderCollBalance();if(i===1)return renderCollTrends();if(i===2)return renderCollBrand();return renderCollMarket();}
function renderCollBalance(){
  // target-vs-current line plan from the real COLL categories, with honest gap arithmetic
  const plan=[['Dresses','dress',10,14,9],['Knitwear','knit',8,3,1],['Trousers','trousers',7,8,6],['Tailoring','blazer',5,4,3],['Outerwear','coat',5,2,0]];
  const rows=plan.map(([cat,g,target,current,approved])=>{const gap=current-target;const need=gap<0;return `<tr class="lp-row" onclick="toast('Drill-down into ${cat} styles — illustrative in this prototype')">
    <td class="lp-cat">${cat}</td><td>${target}</td><td>${current}</td><td>${approved}</td>
    <td class="lp-gap" style="color:${gap===0?'var(--ink-3)':need?'var(--clay)':'var(--ochre)'}">${gap>0?'+'+gap:gap}</td>
    <td>${need?`<button class="link" onclick="event.stopPropagation();openBrief('${cat==='Knitwear'?'Sheer rib knit':cat+' addition'}')">Create brief →</button>`:gap>0?`<button class="link" onclick="event.stopPropagation();toast('Proposed decision: reduce depth — logged for review')">Review depth</button>`:'<span class="lp-ok">On plan</span>'}</td>
  </tr>`;}).join('');
  return `<div class="card"><div class="head"><div><div class="eyebrow">Line plan · target vs current</div><h3>Where the assortment sits against plan</h3></div></div>
    <table class="lp-table"><thead><tr><th>Category</th><th>Target</th><th>Current</th><th>Approved</th><th>Gap</th><th></th></tr></thead><tbody>${rows}</tbody></table>
    <p class="lp-note">Gaps route to a <b>brief</b>, not straight to Studio — the collection decides what's needed before anything is designed. Over-plan categories propose a depth-reduction decision for review, they don't auto-cut. Targets are illustrative; real targets come from the OTB plan.</p>
  </div>`;
}
function renderCollTrends(){
  const sig=[
    ['Sheer rib knit','Accelerating','clay','No planned styles · one approved brief open','Under-covered against an accelerating signal'],
    ['Bias slip dress','Peaking','ochre','Three planned · target is two','Likely over-represented — at peak, not growing'],
    ['Tonal knitwear','Established','sage','Two planned · target is three','One short of plan'],
    ['Washed indigo','Emerging','cobalt','No planned styles','Early signal — monitor before committing'],
    ['Wide trouser','Accelerating','sage','Three planned · on target','Well covered']
  ];
  return `<div class="grid col-2"><div class="card"><div class="head"><div><div class="eyebrow">Signal coverage</div><h3>Market signals vs what you're planning</h3></div></div>
    ${sig.map(([n,stage,col,plan,verdict])=>`<div class="sig-cov-row"><div class="scr-top"><span class="scr-n">${n}</span><span class="scr-stage" style="color:var(--${col})">${stage}</span></div><div class="scr-plan">${plan}</div><div class="scr-verdict" style="color:var(--${col})">${verdict}</div></div>`).join('')}
    <p class="lp-note">Each signal is matched to planned style counts against the line-plan target — a concrete count, not an abstract percentage.</p>
  </div>
  <div class="card"><div class="head"><div><div class="eyebrow">Coverage risks</div><h3>Where signal and plan diverge</h3></div></div>
    <p style="font-size:13px;color:var(--ink-2);margin:0 0 14px;line-height:1.5">Dresses sit at roughly 62% of the planned line — above the historical 48%. No knitwear entry yet despite an accelerating signal and an open brief.</p>
    ${[['Dress over-indexing','High','Propose reducing 3–4 dress styles for review'],['No knitwear entry','High','The open sheer-rib brief needs to convert to styles'],['Outerwear under-plan','Medium','One unlined coat short of target']].map(([issue,level,action])=>`<div style="padding:9px 0;border-top:1px solid var(--hair)"><div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="font-weight:600;font-size:12.5px">${issue}</span><span style="font-family:var(--d);font-size:9px;color:${level==='High'?'var(--clay)':'var(--ochre)'}">${level}</span></div><p style="font-size:12px;color:var(--ink-2);margin:0">${action}</p></div>`).join('')}
  </div></div>`;
}
function renderCollBrand(){
  // attributable coherence + repetition findings, not an opaque identity %
  const coherence=[['Bias & architectural codes','Strong','38 of 42 styles use established silhouette codes'],['Tonal palette discipline','Moderate','30 of 42 styles sit in the core neutral range'],['Surface-detail restraint','Conflict','2 styles use decorative hardware that conflicts with the guardrail'],['Fabric-quality floor','Strong','all styles sit above the quality threshold']];
  const repetition=[['Near-duplicate silhouettes','7 styles','compete internally for the same customer'],['Colour repetition','Bone in 24% of styles','heaviest single-colour concentration'],['Fabric repetition','Satin across 9 styles','concentration risk if the mill slips']];
  return `<div class="grid col-2">
  <div class="card"><div class="head"><div><div class="eyebrow">Coherence</div><h3>Does it read as Meridian?</h3></div></div>
    <p style="font-size:13px;color:var(--ink-2);margin:0 0 6px;line-height:1.5">Strong overall — the line is recognisably on-brand. Two styles drift past the surface-detail guardrail and need review.</p>
    ${coherence.map(([dim,lvl,det])=>`<div style="display:grid;grid-template-columns:1fr auto;gap:6px;align-items:baseline;padding:10px 0;border-top:1px solid var(--hair)"><div><div style="font-size:12.5px;font-weight:600">${dim}</div><div style="font-size:11.5px;color:var(--ink-2)">${det}</div></div><span style="font-family:var(--d);font-size:9px;color:${lvl==='Strong'?'var(--sage)':lvl==='Conflict'?'var(--clay)':'var(--ochre)'}">${lvl}</span></div>`).join('')}
  </div>
  <div class="card"><div class="head"><div><div class="eyebrow">Repetition</div><h3>Too many of the same?</h3></div></div>
    <p style="font-size:13px;color:var(--ink-2);margin:0 0 6px;line-height:1.5">Coherence and repetition are different risks — a coherent line can still cannibalise itself. These are the internal overlaps.</p>
    ${repetition.map(([dim,val,det])=>`<div style="padding:10px 0;border-top:1px solid var(--hair)"><div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="font-size:12.5px;font-weight:600">${dim}</span><span style="font-family:var(--d);font-size:11px;color:var(--ochre)">${val}</span></div><p style="font-size:11.5px;color:var(--ink-2);margin:0">${det}</p></div>`).join('')}
    <div style="background:var(--paper);border-radius:9px;padding:13px;font-size:12px;color:var(--ink-2);line-height:1.5;margin-top:12px">Consolidating 3 of the 7 near-duplicates and redirecting that depth into the knit gap would cut internal cannibalisation and rebalance the line.</div>
  </div></div>`;
}
function renderCollMarket(){
  // collection-positioning against the set — attributable overlap, not opaque %, and no global whitespace re-run
  const overlap=[['Toteme','Moderate','ochre','Strong overlap in wide-trouser proportions and tonal palette; limited overlap in knitwear and price'],['Arket','Moderate','ochre','Shared fabric territory; differentiated on price architecture'],['GEEL','Low','sage','Differentiated on tonal restraint; GEEL leans louder and knit-led'],['COS','Low','sage','Different price architecture and broader assortment']];
  return `<div class="grid col-2"><div class="card"><div class="head"><div><div class="eyebrow">Market positioning</div><h3>How this collection reads against the set</h3></div></div>
    <p style="font-size:12px;color:var(--ink-3);margin:0 0 8px">Positioning of <b>this AW26 line</b> only — not a re-run of the global whitespace model. For market discovery, use Opportunities.</p>
    ${overlap.map(([b,lvl,col,note])=>`<div style="padding:11px 0;border-top:1px solid var(--hair)"><div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="font-weight:600;font-size:12.5px">${b}</span><span style="font-family:var(--d);font-size:9px;color:var(--${col})">${lvl} overlap</span></div><p style="font-size:11.5px;color:var(--ink-2);margin:0;line-height:1.45">${note}</p></div>`).join('')}
  </div>
  <div class="card"><div class="head"><div><div class="eyebrow">Where this line is distinct</div><h3>Your differentiated ground</h3></div></div>
    ${[['Sheer rib knit · mid price','No direct-competitor coverage in your set'],['Bias slip · extended sizing','Thin supply across the set'],['Unlined coat · tonal','Low supply in your direct group']].map(([opp,note])=>`<div style="padding:11px 0;border-top:1px solid var(--hair)"><div style="font-weight:600;font-size:13px;margin-bottom:3px">${opp}</div><div style="font-size:12px;color:var(--ink-3);margin-bottom:5px">${note}</div><button class="link" onclick="go('whitespace');toast('Opened in Opportunities')">Evaluate in Opportunities →</button></div>`).join('')}
  </div></div>`;
}

/* ===== v5 Outcome Intelligence ===== */
function renderOutcomes(){
  const kpis2=document.getElementById('kpis2');if(kpis2)renderKPIs(kpis2);
  const el=document.getElementById('view-analytics');
  el.querySelector('.vh h1').textContent='Outcome Intelligence';
  el.querySelector('.vh p').textContent='What Atelier predicted, what you decided, and what the market confirmed. This is how the model proves its value.';
  let oi=document.getElementById('outcomes-injected');
  if(!oi){oi=document.createElement('div');oi.id='outcomes-injected';
  oi.innerHTML=`<div class="outcome-grid">${[['23','Outcomes tracked','+12 this season','var(--cobalt)'],['78%','Forecast accuracy','vs 62% last season','var(--sage)'],['3 weeks','Avg lead time','ahead of market','var(--ember)']].map(([v,l,d,c])=>`<div class="oc"><div class="on2" style="color:${c}">${v}</div><div class="ol">${l}</div><div class="od">${d}</div></div>`).join('')}</div><div class="eyebrow" style="margin-bottom:12px">Forecast history${confTag('ILLUSTRATIVE','illustrative')}</div><div>${FORECAST_HISTORY.map(f=>`<div class="forecast-row"><div class="fr-thumb">${mtile({color:'#8C8A7E',fabric:'Satin',garmentKey:'dress',img:f.img})}</div><span style="font-weight:600;font-size:13.5px">${f.name}</span><div style="font-size:12px;color:var(--ink-2)">Detected ${f.detected} · Predicted ${f.predicted} · Actual ${f.actual}</div><span style="font-family:var(--d);font-size:11px;color:var(--ink-3)">${f.error}</span><span class="fr-tag fr-${f.tag}">${f.tag==='hit'?'✓ Hit':'✕ Miss'}</span>${f.score?`<span style="font-family:var(--serif);font-size:20px;font-weight:500;color:var(--sage)">${f.score}</span>`:'<span></span>'}</div>`).join('')}</div>`;
  el.querySelector('.vh').after(oi);}
}

/* ===== PRODUCT CATALOG (core entity) ===== */
/* ===== Catalog: Style → Colorway → Size → SKU ===== */
// A Style is the design. Colorways are color variants. Each colorway has sized sellable SKUs.
// We deliberately do NOT show cost/margin precision — only data we can actually source:
// sell-through, stock, returns, demand. Price is a positioning band, qualitative.
const COL_NAMES={'#4A4944':'Charcoal','#1B1A14':'Ink','#CDBFA6':'Oat','#E7E1D3':'Bone','#9A968B':'Stone','#B07A5B':'Clay','#3C4C68':'Indigo','#8B9079':'Sage','#9C4A2E':'Rust'};
function colName(h){return COL_NAMES[h]||'Colour';}
function colCode(h){return (colName(h).slice(0,3)).toUpperCase();}
// build sized SKUs for a colorway given a size list and a velocity profile
function buildSkus(styleId,colorHex,sizes,velocity){
  return sizes.map((sz,i)=>({
    sku:`${styleId}-${colCode(colorHex)}-${sz.replace(/[^A-Za-z0-9]/g,'')}`,
    size:sz, stock:velocity[i]?.stock??0, sold:velocity[i]?.sold??0, st:velocity[i]?.st??0
  }));
}
const SIZE_RUNS={adult:['XS','S','M','L','XL'],adultS:['S','M','L','XL'],kids:['3y','4y','5y','6y','7y','8y']};
// velocity profiles (units sold/in-stock + sell-through per size) — illustrative but internally consistent
function vel(profile){ // profile = array of [stock, sold]
  return profile.map(([stock,sold])=>({stock,sold,st:Math.round(sold/(stock+sold)*100)}));
}
const CATALOG=[
 {style:'MR-TRS-052',n:'Architectural wide trouser',cat:'Tailoring',gd:'Women',season:'AW25',g:'trousers',f:'Twill',img:IMG.tailor,price:280,band:'Core',st:92,returns:6.2,status:'win',
  colorways:[
   {hex:'#4A4944',sizes:SIZE_RUNS.adult,velocity:vel([[14,70],[22,118],[40,150],[30,96],[18,52]])},
   {hex:'#1B1A14',sizes:SIZE_RUNS.adult,velocity:vel([[10,40],[18,80],[28,110],[20,70],[12,36]])},
   {hex:'#CDBFA6',sizes:SIZE_RUNS.adult,velocity:vel([[8,24],[14,52],[22,76],[16,48],[10,22]])}]},
 {style:'MR-KNT-114',n:'Ribbed merino tank — bone',cat:'Knitwear',gd:'Women',season:'AW25',g:'knit',f:'Merino wool',img:IMG.knit,price:128,band:'Entry',st:88,returns:9.1,status:'win',
  colorways:[
   {hex:'#E7E1D3',sizes:SIZE_RUNS.adultS,velocity:vel([[6,82],[8,120],[12,140],[8,76]])},
   {hex:'#9A968B',sizes:SIZE_RUNS.adultS,velocity:vel([[5,40],[7,60],[9,72],[6,38]])}]},
 {style:'MR-DRS-090',n:'Bias slip dress',cat:'Dress',gd:'Women',season:'AW25',g:'dress',f:'Satin',img:IMG.slip,price:320,band:'Premium',st:77,returns:18.0,status:'ok',
  colorways:[
   {hex:'#1B1A14',sizes:SIZE_RUNS.adult,velocity:vel([[14,54],[20,82],[28,96],[20,68],[14,40]])},
   {hex:'#B07A5B',sizes:SIZE_RUNS.adult,velocity:vel([[10,30],[16,52],[22,64],[16,44],[10,24]])},
   {hex:'#E7E1D3',sizes:SIZE_RUNS.adult,velocity:vel([[8,22],[14,40],[20,52],[14,34],[8,18]])}]},
 {style:'MR-BLZ-031',n:'Soft-shoulder blazer',cat:'Tailoring',gd:'Men',season:'AW25',g:'blazer',f:'Merino wool',img:IMG.menshirt,price:480,band:'Premium',st:63,returns:11.4,status:'ok',
  colorways:[
   {hex:'#4A4944',sizes:SIZE_RUNS.adultS,velocity:vel([[18,28],[24,44],[20,40],[14,22]])},
   {hex:'#1B1A14',sizes:SIZE_RUNS.adultS,velocity:vel([[14,20],[18,32],[16,30],[10,16]])}]},
 {style:'MR-OUT-018',n:'Unlined chore coat',cat:'Outerwear',gd:'Men',season:'AW25',g:'coat',f:'Twill',img:IMG.tailor,price:560,band:'Premium',st:54,returns:7.8,status:'ok',
  colorways:[
   {hex:'#3C4C68',sizes:SIZE_RUNS.adultS,velocity:vel([[22,26],[30,40],[28,38],[18,22]])},
   {hex:'#8B9079',sizes:SIZE_RUNS.adultS,velocity:vel([[16,18],[20,26],[18,24],[12,14]])},
   {hex:'#4A4944',sizes:SIZE_RUNS.adultS,velocity:vel([[14,14],[18,20],[16,18],[10,10]])}]},
 {style:'MR-SHT-077',n:'Boxy poplin shirt',cat:'Tops',gd:'Women',season:'SS25',g:'tee',f:'Organic cotton',img:IMG.corset,price:95,band:'Entry',st:19,returns:13.8,status:'warn',
  colorways:[
   {hex:'#B07A5B',sizes:SIZE_RUNS.adultS,velocity:vel([[120,18],[140,30],[110,26],[50,10]])},
   {hex:'#E7E1D3',sizes:SIZE_RUNS.adultS,velocity:vel([[90,12],[110,20],[80,16],[40,6]])}]},
 {style:'MR-DEN-044',n:'Barrel jean — indigo',cat:'Denim',gd:'Women',season:'SS25',g:'trousers',f:'Denim',img:IMG.mentrouser,price:230,band:'Core',st:71,returns:12.1,status:'ok',
  colorways:[
   {hex:'#3C4C68',sizes:SIZE_RUNS.adult,velocity:vel([[12,44],[18,72],[24,88],[18,60],[12,30]])},
   {hex:'#1B1A14',sizes:SIZE_RUNS.adult,velocity:vel([[8,24],[14,40],[18,50],[14,34],[8,18]])}]},
 {style:'MR-KID-009',n:'Garment-dyed mini tee',cat:'Kids',gd:'Kids',season:'SS25',g:'tee',f:'Organic cotton',img:IMG.knit,price:60,band:'Entry',st:66,returns:5.2,status:'ok',
  colorways:[
   {hex:'#8B9079',sizes:SIZE_RUNS.kids,velocity:vel([[20,40],[24,52],[26,58],[22,46],[16,30],[12,20]])},
   {hex:'#CDBFA6',sizes:SIZE_RUNS.kids,velocity:vel([[16,28],[20,36],[22,42],[18,32],[14,22],[10,14]])},
   {hex:'#B07A5B',sizes:SIZE_RUNS.kids,velocity:vel([[12,18],[16,24],[18,28],[14,22],[10,14],[8,10]])}]},
 {style:'MR-SKT-021',n:'Drop-waist midi skirt',cat:'Skirts',gd:'Women',season:'AW25',g:'skirt',f:'Tencel',img:IMG.skirt,price:220,band:'Core',st:48,returns:14.6,status:'ok',
  colorways:[
   {hex:'#4A4944',sizes:SIZE_RUNS.adultS,velocity:vel([[16,16],[22,28],[20,24],[14,14]])},
   {hex:'#9A968B',sizes:SIZE_RUNS.adultS,velocity:vel([[12,10],[16,18],[14,16],[10,8]])}]},
 {style:'MR-KNT-088',n:'Soft knit cardigan',cat:'Knitwear',gd:'Women',season:'AW24',g:'knit',f:'Merino wool',img:IMG.menknit,price:240,band:'Core',st:44,returns:10.2,status:'warn',
  colorways:[
   {hex:'#9A968B',sizes:SIZE_RUNS.adultS,velocity:vel([[60,20],[70,34],[50,28],[30,14]])},
   {hex:'#E7E1D3',sizes:SIZE_RUNS.adultS,velocity:vel([[44,12],[52,20],[40,16],[24,8]])}]},
 {style:'MR-OUT-052',n:'Cropped puffer',cat:'Outerwear',gd:'Women',season:'AW24',g:'coat',f:'Technical shell',img:IMG.tailor,price:340,band:'Core',st:39,returns:9.4,status:'warn',
  colorways:[
   {hex:'#1B1A14',sizes:SIZE_RUNS.adultS,velocity:vel([[56,16],[64,26],[48,20],[28,10]])},
   {hex:'#9C4A2E',sizes:SIZE_RUNS.adultS,velocity:vel([[40,8],[48,14],[36,11],[22,6]])}]},
 {style:'MR-DRS-061',n:'Sunlit wrap dress',cat:'Dress',gd:'Women',season:'SS25',g:'dress',f:'Linen',img:IMG.sunlit,price:290,band:'Core',st:74,returns:11.0,status:'ok',
  colorways:[
   {hex:'#CDBFA6',sizes:SIZE_RUNS.adult,velocity:vel([[10,30],[16,54],[22,68],[16,46],[10,24]])},
   {hex:'#B07A5B',sizes:SIZE_RUNS.adult,velocity:vel([[8,20],[14,36],[18,46],[14,30],[8,16]])}]},
];
// derive rollups onto each style + build sized SKUs
CATALOG.forEach(s=>{
  let stock=0,sold=0;
  s.colorways.forEach(cw=>{cw.skus=buildSkus(s.style,cw.hex,cw.sizes,cw.velocity);cw.skus.forEach(k=>{stock+=k.stock;sold+=k.sold;});
    cw.sold=cw.skus.reduce((a,k)=>a+k.sold,0); cw.stock=cw.skus.reduce((a,k)=>a+k.stock,0);
    cw.st=Math.round(cw.sold/(cw.sold+cw.stock)*100);
  });
  s.units=stock; s.sold=sold; s.skuCount=s.colorways.reduce((a,c)=>a+c.skus.length,0); s.colors=s.colorways.map(c=>c.hex);
  s.sizes=s.colorways[0].sizes[0]+'–'+s.colorways[0].sizes.slice(-1)[0];
  // CANONICAL: style sell-through is computed from SKUs, never stored separately
  s.st=Math.round(sold/(sold+stock)*100);
});
// ---- lifecycle: weeks live per style (illustrative but fixed), used to make sell-through diagnostic ----
const STYLE_WEEKS={'MR-TRS-052':9,'MR-KNT-114':6,'MR-DRS-090':12,'MR-BLZ-031':10,'MR-OUT-018':8,'MR-SHT-077':14,'MR-DEN-044':11,'MR-KID-009':7,'MR-SKT-021':13,'MR-KNT-088':16,'MR-OUT-052':15,'MR-DRS-061':9};
// a simple lifecycle benchmark: where a typical style should be by week N (sell-through curve)
function benchAt(week){return Math.min(95,Math.round(8+week*5.2));} // ~week5≈34, week9≈55, week14≈81
CATALOG.forEach(s=>{
  s.weeks=STYLE_WEEKS[s.style]||10;
  s.bench=benchAt(s.weeks);
  s.benchVar=s.st-s.bench; // + = ahead of where it should be, - = behind
});
// ---- rule-based status, derived (not stored) ----
function deriveStatus(p){
  const reasons=[];
  let status='ok';
  if(p.benchVar>=15&&p.returns<14){status='win';reasons.push(`${p.benchVar} pts ahead of the week-${p.weeks} benchmark`);}
  else if(p.benchVar<=-12||p.st<35){status='warn';if(p.benchVar<=-12)reasons.push(`${Math.abs(p.benchVar)} pts behind benchmark`);if(p.st<35)reasons.push(`${p.st}% sell-through`);}
  else {reasons.push(`within benchmark range (${p.benchVar>=0?'+':''}${p.benchVar} pts)`);}
  if(p.returns>15){if(status!=='warn')reasons.push(`but ${p.returns}% returns — above the 15% line`);else reasons.push(`${p.returns}% returns`);}
  return {status,reasons};
}
CATALOG.forEach(p=>{const d=deriveStatus(p);p.status=d.status;p.statusReasons=d.reasons;});
let catFilter={cat:'All',gd:'All',status:'All',q:'',season:'All'};
let catMode='visual'; // visual | exceptions
let catView='cards'; // cards | table | matrix
let catSort='recommended';
let catExc='all'; // all | stockout | returns | weak
function catStatusInfo(s){return {win:['Scaling','var(--sage)','#EDF3EF'],ok:['Healthy','var(--cobalt)','var(--cobalt-wash)'],warn:['At risk','var(--clay)','var(--clay-wash)']}[s];}
function bandColor(b){return {Entry:'var(--ink-3)',Core:'var(--cobalt)',Premium:'var(--ember-ink)'}[b]||'var(--ink-3)';}

// ---- honest product diagnostics, all derived from real velocity data ----
// Two independent health dimensions: SALES health (sell-through vs benchmark, stock) and
// CUSTOMER-EXPERIENCE risk (returns). A style can be strong on one and weak on the other.
function styleDiag(p){
  const cwSold=p.colorways.map(cw=>({hex:cw.hex,sold:cw.skus.reduce((a,k)=>a+k.sold,0)}));
  const totalSold=cwSold.reduce((a,c)=>a+c.sold,0)||1;
  const lead=cwSold.slice().sort((a,b)=>b.sold-a.sold)[0];
  const leadShare=Math.round(lead.sold/totalSold*100);
  const allSkus=p.colorways.flatMap(cw=>cw.skus.map(k=>({...k,hex:cw.hex})));
  // "low stock" not "low cover" — we have stock + sell-through, but no velocity/lead-time, so we can't honestly call it cover
  const hot=allSkus.filter(k=>k.st>=80&&k.stock<=12);
  const cold=allSkus.filter(k=>k.st<45);
  // SALES-HEALTH flags (inventory + demand)
  const salesFlags=[];
  if(p.status==='win'&&hot.length) salesFlags.push({sev:'sage',t:'Low stock',d:`${[...new Set(hot.map(k=>k.size))].join('/')} nearly gone — reorder window`});
  if(cold.length>=3) salesFlags.push({sev:'ochre',t:'Slow sizes',d:`${[...new Set(cold.map(k=>k.size))].join('/')} sitting`});
  if(p.status==='warn'&&p.st<30) salesFlags.push({sev:'clay',t:'Weak demand',d:`${p.st}% sell-through`});
  // CUSTOMER-EXPERIENCE flags (returns/fit) — kept separate
  const cxFlags=[];
  if(p.returns>15) cxFlags.push({sev:'clay',t:'Return exception',d:`${p.returns}% — above the 15% line`});
  else if(p.returns>11) cxFlags.push({sev:'ochre',t:'Returns to watch',d:`${p.returns}% — near the line`});
  const flags=[...salesFlags,...cxFlags]; // combined for the card's single flag
  return {leadHex:lead.hex,leadShare,hot,cold,salesFlags,cxFlags,flags,totalSold};
}
function catInterp(p){
  const d=styleDiag(p);
  const bench=p.benchVar>=10?`${p.benchVar} pts ahead of the week-${p.weeks} benchmark`:p.benchVar<=-10?`${Math.abs(p.benchVar)} pts behind the week-${p.weeks} benchmark`:`tracking its week-${p.weeks} benchmark`;
  if(p.status==='win'&&d.hot.length){const sizes=[...new Set(d.hot.map(k=>k.size))].join('/');return `${bench} · ${colName(d.leadHex)} drives ${d.leadShare}% of demand, ${sizes} nearly gone.`;}
  if(p.status==='warn')return `${bench}${p.returns>15?`, ${p.returns}% returns`:''} — a decision is due.`;
  if(p.returns>15)return `${bench}, but ${p.returns}% returns — check fit before reordering.`;
  if(d.cold.length>=3){const sizes=[...new Set(d.cold.map(k=>k.size))].join('/');return `${bench}; ${sizes} slow — weight the next curve lighter.`;}
  return `${bench} · ${colName(d.leadHex)} leads at ${d.leadShare}% of demand.`;
}
function catalogIntel(){
  const heroes=CATALOG.filter(p=>p.status==='win');
  const atRisk=CATALOG.filter(p=>p.status==='warn');
  const stockoutRisk=CATALOG.filter(p=>p.status==='win'&&styleDiag(p).hot.length>0);
  const returnExc=CATALOG.filter(p=>p.returns>15);
  // styles worth extending = scaling, low returns, not already over-replicated
  const extend=CATALOG.filter(p=>p.status==='win'&&p.returns<12);
  return {heroes,atRisk,stockoutRisk,returnExc,extend};
}

// ---- primary action matched to the product's diagnosis (item 8) ----
function primaryAction(p){
  const d=styleDiag(p);
  if(p.returns>15) return {label:'Review fit',fn:`openStyle('${p.style}')`,col:'var(--clay)'};
  if(p.status==='win'&&d.hot.length) return {label:'Reorder',fn:`event.stopPropagation();reorderFlow('${p.style}')`,col:'var(--sage)'};
  if(p.status==='win') return {label:'Extend',fn:`event.stopPropagation();studioFromOpp('${p.n.replace(/'/g,"\\'")}')`,col:'var(--cobalt)'};
  if(p.status==='warn') return {label:'Plan markdown',fn:`openStyle('${p.style}')`,col:'var(--ochre)'};
  return {label:'Review',fn:`openStyle('${p.style}')`,col:'var(--ink-3)'};
}
function catCards(rows){
  return `<div class="cat-grid">${rows.map(p=>{const si=catStatusInfo(p.status);const d=styleDiag(p);const act=primaryAction(p);return `<div class="cat-card" onclick="openStyle('${p.style}')">
    <div class="cc-img">${mtile({color:p.colors[0],fabric:p.f,garmentKey:p.g,img:p.img})}<span class="cc-status" style="background:${si[2]};color:${si[1]}">${si[0]}</span>
      ${d.flags.length?`<span class="cc-flag" style="background:${d.flags[0].sev==='clay'?'var(--clay)':d.flags[0].sev==='ochre'?'var(--ochre)':'var(--sage)'}">${d.flags[0].t}</span>`:''}
      <span class="cc-colordots">${p.colors.map(c=>`<span style="background:${c}"></span>`).join('')}</span></div>
    <div class="cc-body">
      <div class="cc-top"><span class="cc-sku">${p.style}</span><span class="cc-season">${p.season}</span></div>
      <div class="cc-name">${p.n}</div>
      <div class="cc-meta">${p.cat} · ${p.gd} · ${p.colorways.length} colourways · ${p.skuCount} SKUs</div>
      <div class="cc-stats">
        <div class="ccs"><span class="ccs-v" style="color:${p.st>=70?'var(--sage)':p.st>=45?'var(--ochre)':'var(--clay)'}">${p.st}%</span><span class="ccs-l">Sell-thru · wk${p.weeks}</span></div>
        <div class="ccs"><span class="ccs-v" style="color:${p.benchVar>=10?'var(--sage)':p.benchVar<=-10?'var(--clay)':'var(--ink)'}">${p.benchVar>=0?'+':''}${p.benchVar}</span><span class="ccs-l">vs benchmark</span></div>
        <div class="ccs"><span class="ccs-v" style="color:${p.returns>15?'var(--clay)':'var(--ink)'}">${p.returns}%</span><span class="ccs-l">Returns</span></div>
      </div>
      <div class="cc-interp">${catInterp(p)}</div>
      <button class="cc-action" style="--ac:${act.col}" onclick="${act.fn}">${act.label} →</button>
    </div>
  </div>`;}).join('')}</div>`;
}
function catTable(rows){
  return `<div class="cat-table-wrap"><table class="cat-table">
    <thead><tr><th>Product</th><th>Season</th><th>Wk</th><th>Sell-thru</th><th>vs bench</th><th>Stock</th><th>Returns</th><th>Status</th><th>Action</th></tr></thead>
    <tbody>${rows.map(p=>{const si=catStatusInfo(p.status);const act=primaryAction(p);return `<tr onclick="openStyle('${p.style}')">
      <td><div class="ct-prod"><div class="ct-thumb">${mtile({color:p.colors[0],fabric:p.f,garmentKey:p.g,img:p.img})}</div><div><div class="ct-name">${p.n}</div><div class="ct-code">${p.style} · ${p.cat}</div></div></div></td>
      <td class="ct-mono">${p.season}</td>
      <td class="ct-mono">${p.weeks}</td>
      <td class="ct-mono" style="color:${p.st>=70?'var(--sage)':p.st>=45?'var(--ochre)':'var(--clay)'};font-weight:700">${p.st}%</td>
      <td class="ct-mono" style="color:${p.benchVar>=10?'var(--sage)':p.benchVar<=-10?'var(--clay)':'var(--ink-2)'}">${p.benchVar>=0?'+':''}${p.benchVar}</td>
      <td class="ct-mono">${p.units}</td>
      <td class="ct-mono" style="color:${p.returns>15?'var(--clay)':'var(--ink-2)'}">${p.returns}%</td>
      <td><span class="ct-status" style="background:${si[2]};color:${si[1]}">${si[0]}</span></td>
      <td><button class="ct-act" style="--ac:${act.col}" onclick="${act.fn}">${act.label}</button></td>
    </tr>`;}).join('')}</tbody></table></div>`;
}
function catMatrix(rows){
  // size & colour heatmap: one row per colourway, columns = sizes, cell = sell-through
  const cell=(k)=>{const c=k.st>=80?'var(--sage)':k.st>=55?'#9DBE8E':k.st>=45?'var(--ochre)':'var(--clay)';return `<td class="cm-cell" style="background:${c}" title="${k.size}: ${k.sold} sold / ${k.stock} left · ${k.st}%"><span class="cm-st">${k.st}</span><span class="cm-sub">${k.stock}</span></td>`;};
  return `<div class="cat-matrix-wrap">
    <div class="cm-legend"><span>Each cell: <b>sell-through %</b> over <b>units left</b>.</span><span class="cm-key"><i style="background:var(--sage)"></i>≥80<i style="background:#9DBE8E"></i>55+<i style="background:var(--ochre)"></i>45+<i style="background:var(--clay)"></i>&lt;45</span></div>
    ${rows.map(p=>{const sizes=p.colorways[0].sizes;return `<div class="cm-style">
      <div class="cm-style-head" onclick="openStyle('${p.style}')"><span class="cm-name">${p.n}</span><span class="cm-code">${p.style} · ${p.st}% overall</span></div>
      <table class="cat-matrix"><thead><tr><th class="cm-rowhead">Colourway</th>${sizes.map(s=>`<th>${s}</th>`).join('')}</tr></thead>
      <tbody>${p.colorways.map(cw=>`<tr><td class="cm-rowhead"><span class="cm-chip" style="background:${cw.hex}"></span>${colName(cw.hex)}</td>${cw.skus.map(cell).join('')}</tr>`).join('')}</tbody></table>
    </div>`;}).join('')}
  </div>`;
}
function renderCatalog(){
  const el=document.getElementById('catalogBody');if(!el)return;
  const cats=['All',...new Set(CATALOG.map(p=>p.cat))];
  const genders=['All','Women','Men','Kids'];
  const statuses=['All','win','ok','warn'];
  const seasons=['All',...new Set(CATALOG.map(p=>p.season))];
  const intel=catalogIntel();
  let rows=CATALOG.filter(p=>(catFilter.cat==='All'||p.cat===catFilter.cat)&&(catFilter.gd==='All'||p.gd===catFilter.gd)&&(catFilter.season==='All'||p.season===catFilter.season)&&(catFilter.status==='All'||p.status===catFilter.status)&&(!catFilter.q||p.n.toLowerCase().includes(catFilter.q.toLowerCase())||p.style.toLowerCase().includes(catFilter.q.toLowerCase())));
  if(catMode==='exceptions'){
    const isStockout=p=>intel.stockoutRisk.includes(p);
    const isReturn=p=>p.returns>15;
    const isWeak=p=>p.status==='warn';
    rows=rows.filter(p=>isStockout(p)||isReturn(p)||isWeak(p));
    if(catExc==='stockout')rows=rows.filter(isStockout);
    else if(catExc==='returns')rows=rows.filter(isReturn);
    else if(catExc==='weak')rows=rows.filter(p=>isWeak(p)&&!isStockout(p));
  }
  // sorting
  const sorters={
    recommended:(a,b)=>(b.status==='warn')-(a.status==='warn')||Math.abs(b.benchVar)-Math.abs(a.benchVar),
    urgent:(a,b)=>(b.status==='warn')-(a.status==='warn')||b.returns-a.returns,
    sthi:(a,b)=>b.st-a.st, stlo:(a,b)=>a.st-b.st,
    bench:(a,b)=>b.benchVar-a.benchVar,
    returns:(a,b)=>b.returns-a.returns,
    stock:(a,b)=>b.units-a.units
  };
  rows=rows.slice().sort(sorters[catSort]||sorters.recommended);

  const fullPriceST=Math.round(CATALOG.filter(p=>p.status!=='warn').reduce((a,p)=>a+p.st,0)/CATALOG.filter(p=>p.status!=='warn').length);

  el.innerHTML=`
   <div class="cat-intel">
     <div class="ci-head"><span class="ci-tag">CATALOG INTELLIGENCE</span><span class="ci-sub">What needs a decision — computed from canonical SKU sell-through</span></div>
     <div class="ci-row ci-row-4">
       <button class="ci-item" onclick="catMode='exceptions';catExc='all';renderCatalog()"><span class="ci-n" style="color:var(--clay)">${intel.atRisk.length}</span><span class="ci-l">products requiring action</span></button>
       <button class="ci-item" onclick="catMode='exceptions';catExc='stockout';renderCatalog()"><span class="ci-n" style="color:var(--ember-ink)">${intel.stockoutRisk.length}</span><span class="ci-l">stockout exposure</span></button>
       <button class="ci-item" onclick="catMode='exceptions';catExc='returns';renderCatalog()"><span class="ci-n" style="color:var(--clay)">${intel.returnExc.length}</span><span class="ci-l">return exceptions</span></button>
       <button class="ci-item" onclick="catMode='visual';catSort='bench';catFilter.status='win';renderCatalog()"><span class="ci-n" style="color:var(--cobalt)">${intel.extend.length}</span><span class="ci-l">extension candidates</span></button>
     </div>
     <div class="ci-foot"><span>${intel.heroes.length} hero styles</span><span class="ci-foot-sep">·</span><button class="ci-foot-link" onclick="catMode='visual';catSort='bench';catFilter.status='win';renderCatalog()">view top performers →</button></div>
   </div>
   <div class="cat-toolbar">
     <div class="cat-search"><svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg><input id="catSearch" placeholder="Search style or code…" value="${catFilter.q}"></div>
     <div class="cat-filters">
       <div class="cat-modes"><button class="cmode ${catMode==='visual'?'on':''}" data-m="visual">All</button><button class="cmode ${catMode==='exceptions'?'on':''}" data-m="exceptions">Exceptions${intel.atRisk.length+intel.returnExc.length?` · ${new Set([...intel.atRisk,...intel.returnExc,...intel.stockoutRisk]).size}`:''}</button></div>
       <div class="cat-views"><button class="cview ${catView==='cards'?'on':''}" data-v="cards" title="Cards">▦</button><button class="cview ${catView==='table'?'on':''}" data-v="table" title="Table">▤</button><button class="cview ${catView==='matrix'?'on':''}" data-v="matrix" title="Size &amp; colour matrix">⊞</button></div>
       <select id="catSort" title="Sort"><option value="recommended" ${catSort==='recommended'?'selected':''}>Recommended</option><option value="urgent" ${catSort==='urgent'?'selected':''}>Most urgent</option><option value="bench" ${catSort==='bench'?'selected':''}>Best vs benchmark</option><option value="sthi" ${catSort==='sthi'?'selected':''}>Highest sell-through</option><option value="stlo" ${catSort==='stlo'?'selected':''}>Lowest sell-through</option><option value="returns" ${catSort==='returns'?'selected':''}>Highest returns</option><option value="stock" ${catSort==='stock'?'selected':''}>Most stock</option></select>
       <select id="catFseason" title="Season">${seasons.map(s=>`<option ${catFilter.season===s?'selected':''}>${s}</option>`).join('')}</select>
       <select id="catFcat">${cats.map(c=>`<option ${catFilter.cat===c?'selected':''}>${c}</option>`).join('')}</select>
       <select id="catFgd">${genders.map(g=>`<option ${catFilter.gd===g?'selected':''}>${g}</option>`).join('')}</select>
       ${catMode!=='exceptions'?`<div class="cat-segs">${statuses.map(s=>`<button class="cseg ${catFilter.status===s?'on':''}" data-st="${s}">${s==='All'?'All':catStatusInfo(s)[0]}</button>`).join('')}</div>`:''}
     </div>
   </div>
   ${catMode==='exceptions'?`<div class="cat-excsub">${[['all','All exceptions'],['stockout','Stockout'],['returns','High returns'],['weak','Weak demand']].map(([k,l])=>`<button class="excsub ${catExc===k?'on':''}" data-exc="${k}">${l}</button>`).join('')}</div>`:''}
   ${rows.length?(catView==='table'?catTable(rows):catView==='matrix'?catMatrix(rows):catCards(rows)):`<div class="cat-empty"><h3>${catMode==='exceptions'?'No exceptions right now':'No styles match these filters'}</h3><p>${catMode==='exceptions'?'Every style is performing within range.':'Try widening the filters.'}</p><button class="btn ghost" onclick="catMode='visual';catFilter={cat:'All',gd:'All',status:'All',q:'',season:'All'};renderCatalog()">${catMode==='exceptions'?'Back to all products':'Clear filters'}</button></div>`}`;
  const s=document.getElementById('catSearch');if(s)s.addEventListener('input',e=>{catFilter.q=e.target.value;clearTimeout(window._catT);window._catT=setTimeout(renderCatalog,160);});
  const fc=document.getElementById('catFcat');if(fc)fc.addEventListener('change',e=>{catFilter.cat=e.target.value;renderCatalog();});
  const fg=document.getElementById('catFgd');if(fg)fg.addEventListener('change',e=>{catFilter.gd=e.target.value;renderCatalog();});
  const fse=document.getElementById('catFseason');if(fse)fse.addEventListener('change',e=>{catFilter.season=e.target.value;renderCatalog();});
  document.querySelectorAll('.cat-views .cview').forEach(b=>b.addEventListener('click',()=>{catView=b.dataset.v;renderCatalog();}));
  document.querySelectorAll('.cat-segs .cseg').forEach(b=>b.addEventListener('click',()=>{catFilter.status=b.dataset.st;renderCatalog();}));
  document.querySelectorAll('.cat-modes .cmode').forEach(b=>b.addEventListener('click',()=>{catMode=b.dataset.m;if(catMode==='exceptions')catExc='all';renderCatalog();}));
  const so=document.getElementById('catSort');if(so)so.addEventListener('change',e=>{catSort=e.target.value;renderCatalog();});
  document.querySelectorAll('.cat-excsub .excsub').forEach(b=>b.addEventListener('click',()=>{catExc=b.dataset.exc;renderCatalog();}));
}
let openColorway={}; // style -> active colorway hex
let drawerTab='overview';
function openStyle(styleId,tab){
  const p=CATALOG.find(x=>x.style===styleId);if(!p)return;
  if(tab)drawerTab=tab; else drawerTab=drawerTab||'overview';
  const si=catStatusInfo(p.status);
  const activeHex=openColorway[styleId]||p.colorways[0].hex;
  const cw=p.colorways.find(c=>c.hex===activeHex)||p.colorways[0];
  const similar=CATALOG.filter(x=>x.style!==styleId&&(x.g===p.g||x.f===p.f)).slice(0,3);
  const diag=styleDiag(p);
  const sittingSkus=cw.skus.filter(k=>k.st<45);
  const act=primaryAction(p);
  const tabs=[['overview','Overview'],['performance','Performance'],['colorsize','Colour & size'],['history','History']];

  const overview=`
    <div class="prod-verdict">${catInterp(p)}</div>
    ${diag.salesFlags.length?`<div class="prod-flags"><div class="pf-label">Sales health</div>${diag.salesFlags.map(f=>`<span class="pflag" style="--c:${f.sev==='clay'?'var(--clay)':f.sev==='ochre'?'var(--ochre)':'var(--sage)'}"><b>${f.t}</b> · ${f.d}</span>`).join('')}</div>`:''}
    ${diag.cxFlags.length?`<div class="prod-flags"><div class="pf-label">Customer experience</div>${diag.cxFlags.map(f=>`<span class="pflag" style="--c:${f.sev==='clay'?'var(--clay)':'var(--ochre)'}"><b>${f.t}</b> · ${f.d}</span>`).join('')}</div>`:''}
    <div class="prod-kpis">
      ${[['€'+p.price,'Retail price'],[p.st+'%','Sell-through',p.st>=70?'var(--sage)':'var(--ochre)'],[p.units,'Units in stock'],[p.sold,'Units sold'],[p.colorways.length,'Colourways'],[p.returns+'%','Returns',p.returns>15?'var(--clay)':'#fff']].map(([v,l,c])=>`<div class="prod-kpi"><div class="pk-v" style="${c?'color:'+c:''}">${v}</div><div class="pk-l">${l}</div></div>`).join('')}
    </div>
    <div class="dr-sec"><div class="sh"><span class="dot" style="background:var(--ink)"></span><h3>Attributes</h3></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">
        ${[['Category',p.cat],['Gender',p.gd],['Season',p.season],['Fabric',p.f],['Size range',p.sizes],['Price band',p.band]].map(([k,v])=>`<div style="background:var(--night-2);border-radius:8px;padding:9px 11px"><div style="font-family:var(--d);font-size:9px;color:#a9a7a0;letter-spacing:.06em;margin-bottom:2px">${k}</div><div style="color:#fff;font-size:12.5px;font-weight:500">${v}</div></div>`).join('')}
      </div>
    </div>`;

  const performance=`
    <div class="perf-bench">
      <div class="pb-head"><span>Lifecycle position</span><span class="pb-wk">week ${p.weeks}</span></div>
      <div class="pb-track"><div class="pb-bench" style="left:${p.bench}%"><span>benchmark ${p.bench}%</span></div><div class="pb-actual" style="width:${p.st}%;background:${p.benchVar>=0?'var(--sage)':'var(--clay)'}"></div></div>
      <div class="pb-read">${p.st}% sell-through · ${p.benchVar>=0?'+':''}${p.benchVar} pts ${p.benchVar>=0?'ahead of':'behind'} where a typical style sits by week ${p.weeks}.</div>
    </div>
    <div class="dr-sec"><div class="sh"><span class="dot" style="background:var(--cobalt)"></span><h3>Colourway performance</h3></div>
      ${p.colorways.slice().sort((a,b)=>b.st-a.st).map(c=>`<div class="cwp-row"><span class="cwp-chip" style="background:${c.hex}"></span><span class="cwp-name">${colName(c.hex)}</span><span class="cwp-bar"><i style="width:${c.st}%;background:${c.st>=70?'var(--sage)':c.st>=45?'var(--ochre)':'var(--clay)'}"></i></span><span class="cwp-st">${c.st}%</span><span class="cwp-units">${c.sold}/${c.sold+c.stock}</span></div>`).join('')}
    </div>
    <div class="dr-sec"><div class="sh"><span class="dot" style="background:var(--ember)"></span><h3>What we don't track yet</h3></div>
      <p style="font-size:12px;color:#cfccbf;line-height:1.5;margin:0">Weekly velocity, return <b>reasons</b>, reviews, regional split and margin would let this show a true trajectory and stock-cover. They need a deeper Shopify and returns connection — Atelier shows what it can source honestly rather than inventing the rest.</p>
    </div>`;

  const colorsize=`
    <p style="font-size:12px;color:#cfccbf;margin:0 0 12px">Each size is its own sellable SKU. Pick a colourway for size-level stock and sell-through.</p>
    <div class="cw-tabs">${p.colorways.map(c=>`<button class="cw-tab ${c.hex===activeHex?'on':''}" onclick="openColorway['${styleId}']='${c.hex}';openStyle('${styleId}','colorsize')"><span class="cw-chip" style="background:${c.hex}"></span>${colName(c.hex)} · ${c.st}%</button>`).join('')}</div>
    <table class="sku-table">
      <thead><tr><th>SKU</th><th>Size</th><th>Stock</th><th>Sold</th><th>Sell-thru</th></tr></thead>
      <tbody>${cw.skus.map(k=>`<tr><td class="sku-code">${k.sku}</td><td><b>${k.size}</b></td><td>${k.stock}</td><td>${k.sold}</td><td><span class="sku-st" style="--w:${k.st}%;--c:${k.st>=70?'var(--sage)':k.st>=45?'var(--ochre)':'var(--clay)'}"><i></i>${k.st}%</span></td></tr>`).join('')}</tbody>
    </table>
    ${sittingSkus.length?`<div style="font-size:11px;color:#a9a7a0;margin-top:10px">⚠ ${sittingSkus.map(k=>k.size).join(', ')} in ${colName(activeHex)} moving slowly — weight the next size curve lighter here.</div>`:`<div style="font-size:11px;color:var(--sage);margin-top:10px">✓ Clean size curve in ${colName(activeHex)} — all sizes selling through.</div>`}`;

  const history=`
    <div class="dr-sec" style="border:none;padding-top:0"><div class="sh"><span class="dot" style="background:var(--sage)"></span><h3>Similar in your catalog</h3></div>
      <p style="font-size:11.5px;color:#a9a7a0;margin:0 0 10px">Closest precedents by construction and fabric — useful for predicting how a successor might behave. <span style="color:#86847a">(Visual/commercial similarity scoring is not yet modelled.)</span></p>
      ${similar.map(s=>{const why=s.g===p.g&&s.f===p.f?'Same garment & fabric':s.g===p.g?'Same silhouette, different fabric':'Same fabric, different silhouette';return `<div onclick="openStyle('${s.style}','overview')" style="display:flex;align-items:center;gap:11px;padding:10px 0;border-top:1px solid rgba(255,255,255,.08);cursor:pointer">
        <div style="width:34px;height:42px;border-radius:6px;overflow:hidden;flex:none">${mtile({color:s.colors[0],fabric:s.f,garmentKey:s.g,img:s.img})}</div>
        <div style="flex:1"><div style="color:#fff;font-weight:600;font-size:12.5px">${s.n}</div><div style="font-family:var(--d);font-size:9px;color:#a9a7a0">${why} · €${s.price}</div></div>
        <div style="font-family:var(--d);font-size:12px;font-weight:700;color:${s.st>=70?'var(--sage)':'var(--ochre)'}">${s.st}%</div>
      </div>`;}).join('')}
    </div>
    <div class="dr-sec"><div class="sh"><span class="dot" style="background:var(--cobalt)"></span><h3>Decisions on this style</h3></div>
      <p style="font-size:12px;color:#cfccbf;margin:0;line-height:1.5">Reorders and briefs raised from this product are recorded in <button class="lnk-inline" onclick="closeDrawer();go('decisions')">Decision Memory →</button>. That's how Atelier carries what you learned here into the next collection.</p>
    </div>`;

  const body={overview,performance,colorsize,history}[drawerTab];
  const html=`
    <div class="dr-hero">${mtile({color:activeHex,fabric:p.f,garmentKey:p.g,img:p.img})}</div>
    <div class="dr-card">
      <div class="ey">${p.cat} · ${p.gd} · ${p.season}</div>
      <h2>${p.n}</h2>
      <div style="display:flex;align-items:center;gap:10px;margin:-6px 0 14px;flex-wrap:wrap">
        <span style="font-family:var(--d);font-size:11px;color:#cfccbf">Style ${p.style}</span>
        <span class="dec-badge" style="background:${si[2]};color:${si[1]};cursor:pointer" onclick="openStatusWhy('${p.style}')" title="Why this status?">${si[0]} ⌕</span>
        <span class="dec-badge" style="background:var(--cobalt-wash);color:var(--cobalt-ink)">${p.band} price</span>
      </div>
      <div class="dr-tabs">${tabs.map(([k,l])=>`<button class="dr-tab ${drawerTab===k?'on':''}" onclick="openStyle('${styleId}','${k}')">${l}</button>`).join('')}</div>
    </div>
    <div class="dr-tabbody">${body}</div>
    <div class="dr-sec dr-actionbar">
      <button class="btn" style="background:${act.col};border-color:${act.col}" onclick="${act.label==='Reorder'?`reorderFlow('${styleId}')`:act.label==='Extend'?`studioFromOpp('${p.n.replace(/'/g,"\\'")}');closeDrawer()`:`openStyle('${styleId}','performance')`}">${act.label}${act.label==='Reorder'&&diag.hot.length?' — '+[...new Set(diag.hot.map(k=>k.size))].join('/'):''}</button>
      <button class="btn ghost" onclick="studioFromOpp('${p.n.replace(/'/g,"\\'")}');closeDrawer()">✦ Design ${p.status==='win'?'successor':'variant'}</button>
      <button class="btn ghost" onclick="collection.add('${p.n.replace(/'/g,"\\'")}');updateCounts();toast('Added to collection');">Add to collection</button>
    </div>`;
  openDrawer(html);
}
window.openStyle=openStyle;window.openColorway=openColorway;window.renderCatalog=renderCatalog;

function reorderFlow(styleId){
  const p=CATALOG.find(x=>x.style===styleId);if(!p)return;
  const diag=styleDiag(p);
  // SKU-LEVEL model. For each colourway, for each size, recommend units to bring the
  // best-selling sizes back to a healthy stock position. Transparent rule:
  //   target = sold * coverFactor (how much of proven demand to re-cover)
  //   recommend = max(0, target - currentStock), only for sizes selling well (st>=55)
  //   skip sizes that are sitting (st<45) entirely
  const cover=0.5; // re-cover ~half of demonstrated demand as a test
  const cwLines=p.colorways.map(cw=>{
    const sizeRecs=cw.skus.map(k=>{
      let units=0,note='';
      if(k.st>=80){units=Math.round(k.sold*cover/2)*2;note='nearly gone';}
      else if(k.st>=55){units=Math.round(k.sold*cover*0.5/2)*2;note='selling';}
      else if(k.st<45){units=0;note='skip — sitting';}
      else {units=0;note='hold';}
      return {size:k.size,stock:k.stock,sold:k.sold,st:k.st,units,note};
    });
    const cwTotal=sizeRecs.reduce((a,s)=>a+s.units,0);
    return {hex:cw.hex,name:colName(cw.hex),sizeRecs,cwTotal};
  }).filter(c=>c.cwTotal>0);
  const recTotal=cwLines.reduce((a,c)=>a+c.cwTotal,0);
  openDrawer(`<div class="dr-card">
    <div class="ey" style="color:var(--cobalt)">Suggested test reorder · ${p.style}</div>
    <h2 style="font-size:22px">${p.n}</h2>
    <div style="font-family:var(--serif);font-size:32px;color:#fff;margin:6px 0 4px">${recTotal} units</div>
    <p style="font-size:12.5px;color:#cfccbf;margin:0 0 16px;line-height:1.5">Planned size by size — each quantity re-covers part of that SKU's proven demand. Sitting sizes are skipped. Edit before approving.</p>
    ${cwLines.map(c=>`<div class="ro-cw">
      <div class="ro-cw-head"><span class="rl-sw" style="background:${c.hex}"></span><span class="ro-cw-name">${c.name}</span><span class="ro-cw-total">${c.cwTotal} units</span></div>
      <table class="ro-table"><thead><tr><th>Size</th><th>In stock</th><th>Sold</th><th>S/T</th><th>Reorder</th></tr></thead><tbody>
      ${c.sizeRecs.map(s=>`<tr class="${s.units>0?'':'ro-skip'}"><td><b>${s.size}</b></td><td>${s.stock}</td><td>${s.sold}</td><td style="color:${s.st>=70?'var(--sage)':s.st>=45?'var(--ochre)':'var(--clay)'}">${s.st}%</td><td class="ro-units">${s.units>0?'+'+s.units:'<span style=\"color:#86847a\">'+s.note+'</span>'}</td></tr>`).join('')}
      </tbody></table>
    </div>`).join('')}
    <div class="reorder-meta">
      <div class="rm-row"><span>Model</span><span>Re-cover ~${Math.round(cover*100)}% of each selling size's demonstrated demand; skip sizes under 45% sell-through</span></div>
      <div class="rm-row"><span>Not included</span><span style="color:var(--ochre)">Lead time, inbound units, regional demand and MOQ — connect these for a firm buy quantity</span></div>
      <div class="rm-row"><span>Watch</span><span>${p.returns>12?p.returns+'% returns — confirm fit holds at depth':'returns within range'}</span></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:18px">
      <button class="btn" onclick="DECISION_HISTORY.unshift({id:Date.now(),date:'Today',title:'${p.n.replace(/'/g,"\\'")} test reorder',rec:'Test reorder ${recTotal} units (size-level)',decision:'accepted',why:'Per-size plan re-covering proven demand on selling sizes.',outcome:'testing',outcomeVal:'→ on order',outcomeClass:'warn',img:'${p.img}',learn:'SKU-level test reorder logged from Catalog — lead time and inbound not yet modelled.'});closeDrawer();toast('Test reorder logged to Decision Memory');flashDecisionMemory&&flashDecisionMemory();">Approve ${recTotal} as a test</button>
      <button class="btn ghost" onclick="closeDrawer()">Cancel</button>
    </div>
  </div>`);
}
window.reorderFlow=reorderFlow;

function openStatusWhy(styleId){
  const p=CATALOG.find(x=>x.style===styleId);if(!p)return;
  const si=catStatusInfo(p.status);
  const rule={win:'Sell-through ≥15 pts above the lifecycle benchmark, with returns within range.',ok:'Performance within benchmark range, no major return or inventory exception.',warn:'Triggered by sell-through well behind benchmark, very low sell-through, or a return exception.'}[p.status];
  openDrawer(`<div class="dr-card">
    <div class="ey" style="color:${si[1]}">Status logic · ${p.style}</div>
    <h2 style="font-size:21px;margin-bottom:4px">Why this is classified as <span style="color:${si[1]}">${si[0]}</span></h2>
    <p style="font-size:12.5px;color:#cfccbf;margin:0 0 16px;line-height:1.5">${rule}</p>
    <div class="reorder-meta" style="margin-bottom:16px">
      ${p.statusReasons.map(r=>`<div class="rm-row" style="grid-template-columns:18px 1fr"><span style="color:${si[1]};padding-top:0">›</span><span style="color:#E7E3D6">${r}</span></div>`).join('')}
    </div>
    <div class="reorder-meta">
      <div class="rm-row"><span>Sell-through</span><span>${p.st}% · canonical, summed from ${p.skuCount} SKUs</span></div>
      <div class="rm-row"><span>Lifecycle</span><span>week ${p.weeks} · benchmark ${p.bench}% · ${p.benchVar>=0?'+':''}${p.benchVar} pts</span></div>
      <div class="rm-row"><span>Returns</span><span>${p.returns}%</span></div>
    </div>
    <p style="font-size:11px;color:#86847a;margin-top:14px;line-height:1.5">Status is derived from these rules, not assigned by hand — change the inputs and the status changes with them.</p>
    <button class="btn ghost" style="margin-top:14px" onclick="openStyle('${styleId}')">← Back to product</button>
  </div>`);
}
window.openStatusWhy=openStatusWhy;
// keep openProduct as an alias so older callers (home, etc.) still resolve to a style by name
function openProduct(ref){const p=CATALOG.find(x=>x.style===ref||x.n===ref);if(p)openStyle(p.style);}
window.openProduct=openProduct;

/* ===== BACKTEST (counterfactual validation) ===== */
const BACKTEST_SEASONS=['AW24','SS25'];
let backtestRun=false,backtestSeason='AW24';
const BACKTEST_DATA={
 AW24:{decisions:[
   {n:'Soft knit cardigan',img:IMG.menknit,atelier:'Cut depth 40%',team:'Full buy',actual:'44% sell-through, heavy markdown',verdict:'atelier',saved:'€38k'},
   {n:'Bias slip — ink',img:IMG.slip,atelier:'Scale +2 colourways',team:'Scale +2 colourways',actual:'88% sell-through',verdict:'agree',saved:'—'},
   {n:'Cropped puffer',img:IMG.tailor,atelier:'Skip — off-brand',team:'Full buy',actual:'39% sell-through',verdict:'atelier',saved:'€41k'},
   {n:'Wide trouser — char',img:IMG.tailor,atelier:'Scale',team:'Scale',actual:'92% sell-through',verdict:'agree',saved:'—'},
   {n:'Heavyweight tee',img:IMG.corset,atelier:'Test small',team:'Mid buy',actual:'58% sell-through',verdict:'atelier',saved:'€12k'},
 ],accuracy:78,wouldSave:'€91k'},
 SS25:{decisions:[
   {n:'Barrel jean — indigo',img:IMG.mentrouser,atelier:'Make 4 SKUs',team:'Make 2 SKUs',actual:'71% sell-through, sold out M/L',verdict:'atelier',saved:'€22k'},
   {n:'Boxy poplin — clay',img:IMG.corset,atelier:'Skip',team:'Full buy',actual:'19% sell-through',verdict:'atelier',saved:'€31k'},
   {n:'Sunlit wrap dress',img:IMG.sunlit,atelier:'Make',team:'Make',actual:'74% sell-through',verdict:'agree',saved:'—'},
   {n:'Mini tee — kids',img:IMG.knit,atelier:'Test',team:'Test',actual:'66% sell-through',verdict:'agree',saved:'—'},
 ],accuracy:81,wouldSave:'€53k'}
};
function renderBacktest(){
  const el=document.getElementById('backtestBody');if(!el)return;
  const d=BACKTEST_DATA[backtestSeason];
  el.innerHTML=`
   <div class="bt-setup">
     <div class="bt-controls">
       <div><div class="eyebrow" style="margin-bottom:8px">Pick a completed season</div>
         <div class="bt-segs">${BACKTEST_SEASONS.map(s=>`<button class="bt-seg ${backtestSeason===s?'on':''}" onclick="backtestSeason='${s}';backtestRun=false;renderBacktest()">${s}</button>`).join('')}</div>
       </div>
       <button class="btn ember" onclick="backtestRun=true;renderBacktest()" ${backtestRun?'style="opacity:.5;pointer-events:none"':''}>▶ Run backtest</button>
     </div>
     <p class="bt-explain">Atelier sees only the data that existed at the start of <b>${backtestSeason}</b> — no hindsight. It makes its calls, then we reveal what actually happened versus what your team decided.</p>
   </div>
   ${!backtestRun?`<div class="bt-empty"><div style="font-size:34px;margin-bottom:12px">🔮</div><h3>Ready to backtest ${backtestSeason}</h3><p>Press run to let Atelier decide blind, then compare against reality.</p></div>`:`
   <div class="bt-results">
     <div class="bt-headline">
       <div class="bth-stat"><div class="bths-v" style="color:var(--sage)">${d.accuracy}%</div><div class="bths-l">Decision accuracy</div></div>
       <div class="bth-stat"><div class="bths-v" style="color:var(--ember)">${d.wouldSave}</div><div class="bths-l">Margin Atelier would have protected</div></div>
       <div class="bth-stat"><div class="bths-v">${d.decisions.filter(x=>x.verdict==='atelier').length}/${d.decisions.length}</div><div class="bths-l">Calls better than the team's</div></div>
     </div>
     <div class="eyebrow" style="margin:6px 0 12px">Decision-by-decision${confTag('ILLUSTRATIVE','illustrative')}</div>
     <div class="bt-table">
       <div class="btr btr-head"><span>Product</span><span>Atelier said</span><span>Team did</span><span>What happened</span><span>Verdict</span></div>
       ${d.decisions.map(x=>`<div class="btr">
         <div class="btr-prod"><div class="btr-img">${mtile({color:'#8C8A7E',fabric:'Satin',garmentKey:'dress',img:x.img})}</div><span>${x.n}</span></div>
         <span class="btr-cell">${x.atelier}</span>
         <span class="btr-cell" style="color:var(--ink-3)">${x.team}</span>
         <span class="btr-cell">${x.actual}</span>
         <span>${x.verdict==='atelier'?`<span class="btr-verdict win">✓ Atelier ${x.saved!=='—'?'· '+x.saved:''}</span>`:`<span class="btr-verdict agree">= Agreed</span>`}</span>
       </div>`).join('')}
     </div>
     <div class="bt-note">In ${backtestSeason}, following Atelier's calls would have protected <b>${d.wouldSave}</b> in margin without any new production — mostly by cutting depth on styles that later needed markdown.</div>
   </div>`}`;
}
window.renderBacktest=renderBacktest;

/* ===== v5 upgraded opportunity drawer with 9-dimension scores ===== */
function openOpp(name){
  const t=TRENDS.find(x=>x.name===name);if(!t)return;const o=buildOpp(t);
  const scores=multiScore(t);
  const esc=s=>s.replace(/'/g,"\\'");
  const lc=lifecycleOf(t);
  const stageCol={Emerging:'var(--cobalt)',Accelerating:'var(--sage)',Peaking:'var(--ochre)',Declining:'var(--clay)'}[lc.stage]||'var(--cobalt)';
  const html=`
    <div class="opp2">
      <div class="opp2-hero">
        <div class="o2h-img">${mtile({color:t.col,fabric:t.fabric,garmentKey:t.g,img:photoFor(t.g,t.mood,t.gd)})}</div>
        <div class="o2h-scrim"></div>
        <div class="o2h-stage" style="background:${stageCol}">${lc.stage.toUpperCase()} · ${peakWindow(lc).toUpperCase()}</div>
        <div class="o2h-foot">
          <div class="o2h-eyebrow">${t.mood} · ${t.cat}</div>
          <h2 class="o2h-title">${t.name}</h2>
        </div>
      </div>

      <div class="opp2-why">
        <div class="o2w-mark">Why now</div>
        <p>${whyFor(t)}</p>
        <div class="o2w-src"><span class="o2w-dot"></span>${t.signals} signals · updated 4h · evidence <b style="color:${signalEvidence(t)[1]}">${signalEvidence(t)[0]}</b></div>
      </div>

      <div class="opp2-axes" style="margin-top:0">
        <div class="o2a-head">Decision assessment</div>
        ${(function(){const r=recommendTrend(t);const ax=v=>v==='High'||v==='Ready'?'var(--sage)':v==='Medium'?'var(--ochre)':'var(--clay)';return [['Market evidence',r.momentum],['Brand relevance',r.brand],['Collection need',r.need],['Execution readiness',r.commercial]].map(([k,v])=>`<div class="o2a-row"><span class="o2a-k">${k}</span><span class="o2a-v" style="color:${ax(v)}">${v}</span></div>`).join('')+`<div class="o2a-action">Recommendation → <b style="color:${r.col}">${r.action}</b> · confidence <b style="color:${signalEvidence(t)[1]}">${signalEvidence(t)[0]}</b></div>`;})()}
      </div>
      <div class="opp2-scorenote">Four decision dimensions, each its own question. Confidence (evidence quality) is read separately from attractiveness — a strong opportunity can rest on thin evidence, and vice versa.</div>

      <div class="dr-card" style="border-radius:14px;margin-top:4px">
      <button class="rawbtn" id="rawBtn" style="margin-top:0">Raw signals ▾</button>
      <div class="rawtable" id="rawTable" style="display:none">
        <div class="rawrow">Shopper requests (30d) <span class="obs">OBSERVED</span> <span class="rv">${t.signals}</span></div>
        <div class="rawrow">Close matches found <span class="obs">OBSERVED</span> <span class="rv">${t.matches}</span></div>
        <div class="rawrow">Median resale vs retail <span class="obs">ESTIMATED</span> <span class="rv">${t.resale}</span></div>
        <div class="rawrow">Demand momentum (90d) <span class="obs">ESTIMATED</span> <span class="rv">${t.yoy}</span></div>
        <div class="rawnote">Observed = found in data we track. Estimated = calculated. We never claim to see the whole market.</div>
      </div>
      </div>
    <div class="dr-sec"><div class="sh"><span class="dot" style="background:var(--ember)"></span><h3>Why this fits Meridian</h3></div>
      <div class="resemble"><div class="rc"><div class="ph">${mtile({color:t.col,fabric:t.fabric,garmentKey:t.g,img:photoFor(t.g,t.mood,t.gd)})}</div><div class="this">This opportunity</div></div><div class="arrow">↔</div>${o.resemble.map(r=>`<div class="rc"><div class="ph">${mtile({color:r.c,fabric:r.f,garmentKey:r.g,img:photoFor(r.g,'Romantic','women')})}</div><div class="nm">${r.n}</div><div class="se">${r.se}% sell-through</div></div>`).join('')}</div>
      <div style="border-top:1px solid var(--hair);margin-top:16px;padding-top:16px">${attrsFor(t).map(a=>`<div class="attr-row"><span class="al">${a[0]}</span><span class="at"><i style="width:${a[1]}%"></i></span><span class="av">${a[1]}%</span></div>`).join('')}<div class="attr-foot">Attribute match drives your <b>${t.demand.f}% brand fit</b> · from your sales data.</div></div>
    </div>
    <div class="dr-sec"><div class="sh"><span class="dot" style="background:var(--cobalt)"></span><h3>How to interpret it for Meridian</h3></div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">${[['Category',t.cat],['Silhouette','Fluid column or bias cut'],['Price band','€'+t.price+'–'+(t.price+120)],['What to avoid','The maximalist or logo-led version']].map(([k,v])=>`<div style="background:var(--night-2);border-radius:8px;padding:10px 12px"><div style="font-family:var(--d);font-size:9px;color:#a9a7a0;letter-spacing:.08em;margin-bottom:3px">${k}</div><div style="color:#fff;font-size:12.5px;font-weight:500">${v}</div></div>`).join('')}</div>
    </div>
    <div class="dr-sec"><div class="sh"><span class="dot" style="background:var(--clay)"></span><h3>Risks</h3></div>${o.risks.map(r=>`<div class="reason"><span class="ck" style="color:var(--clay)">⚠</span><span>${r}</span></div>`).join('')}</div>
    <div class="dr-sec" style="border-top:1px solid rgba(255,255,255,.08);padding-top:18px;margin-top:4px">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn" onclick="openBrief('${esc(t.name)}')">＋ Create Brief — the bridge to Studio</button>
        <button class="btn ghost" onclick="collection.add('${esc(t.name)}');updateCounts();toast('Linked to AW26 for review');closeDrawer()">Link to AW26 review</button>
        <button class="btn ghost" onclick="closeDrawer();go('boards')">Save to board</button>
        <button class="teach-btn btn" onclick="openTeachDrawer('${esc(t.name)}')"><svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg>Teach Atelier</button>
      </div>
      <p style="font-size:11px;color:#86847a;margin-top:12px;line-height:1.5">An opportunity isn't a product yet. Studio takes an approved <b>Brief</b>, not a raw market signal — that's the controlled step between deciding and designing.</p>
    </div>
    </div>`;
  openDrawer(html);
  const rawBtn=document.getElementById('rawBtn');
  if(rawBtn)rawBtn.addEventListener('click',()=>{const rt=document.getElementById('rawTable');const hidden=rt.style.display==='none';rt.style.display=hidden?'':'none';rawBtn.textContent=hidden?'Hide raw signals ▴':'Raw signals ▾';});
}
window.openOpp=openOpp;

function openTeachDrawer(name){
  const html=`<div class="asst-head"><div class="ai-ic" style="background:var(--ember)"><svg width="18" height="18" viewBox="0 0 24 24" stroke="#fff" stroke-width="2" fill="none"><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg></div><h2>Teach Atelier</h2><p>Tell Atelier why "${name}" doesn't fit — and it will weight its model accordingly for Meridian going forward.</p></div>
  <div class="eyebrow" style="margin:16px 0 10px">Why doesn't this work for Meridian?</div>
  <div id="teachGrid" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:18px">${TEACH_REASONS.map(r=>`<button class="chip" onclick="this.classList.toggle('on');document.getElementById('teachSend').disabled=!document.querySelectorAll('#teachGrid .chip.on').length">${r}</button>`).join('')}</div>
  <div class="intent-row"><label>Add context (optional)</label><textarea id="teachNote" rows="3" style="width:100%;border:1px solid var(--hair);border-radius:9px;padding:10px;font-size:13px;resize:none" placeholder="'The silhouette is right but we can't execute this in our current factory setup...'"></textarea></div>
  <div style="display:flex;gap:10px;margin-top:16px">
    <button class="btn ember" id="teachSend" disabled onclick="submitTeach('${name.replace(/'/g,"\\'")}')">Send to Atelier</button>
    <button class="btn ghost" onclick="closeDrawer()">Cancel</button>
  </div>`;
  openDrawer(html);
}
window.openTeachDrawer=openTeachDrawer;

function submitTeach(name){
  // Get selected reasons
  const reasons=[...document.querySelectorAll('#teachGrid .chip.on')].map(b=>b.textContent);
  const note=(document.getElementById('teachNote')||{}).value||'';
  const t=TRENDS.find(x=>x.name===name);
  
  // Prepend a new entry to decision history — this is the visible learning effect
  const newEntry={
    id:Date.now(),
    date:'Today',
    title:name,
    rec:'Atelier recommendation — dismissed',
    decision:'rejected',
    why:reasons.join(' · ')+(note?' · '+note.slice(0,60):''),
    outcome:'learning',
    outcomeVal:'Model updated',
    outcomeClass:'warn',
    img:(t&&t.img)||IMG.slip,
    learn:'Reason: '+reasons[0]+(reasons.length>1?' (+'+( reasons.length-1)+' more)':'')+'. Atelier will weight this brand guardrail more heavily.'
  };
  DECISION_HISTORY.unshift(newEntry);
  
  closeDrawer();
  toast('✦ Atelier updated its model for Meridian');
  
  // Navigate to Decision Memory so the user sees the logged entry immediately
  setTimeout(()=>{
    go('decisions');
    // Flash the new entry to draw attention
    setTimeout(()=>{
      const first=document.querySelector('#decisionBody .dec-item');
      if(first){first.style.transition='background .4s';first.style.background='rgba(31,43,214,.08)';setTimeout(()=>{first.style.background='';},1400);}
    },100);
  },300);
}
window.submitTeach=submitTeach;

/* ===== role switching ===== */
function setRole(r){currentRole=r;const cfg=ROLES[r];
 document.getElementById('roleAv').textContent=cfg.av;
 document.getElementById('roleWho').innerHTML=cfg.who+'<small id="roleTitle">'+cfg.title+'</small>';
 document.querySelectorAll('#rolepop button').forEach(b=>b.classList.toggle('on',b.dataset.role===r));
 document.getElementById('rolepop').classList.remove('on');renderHome();toast('Workspace set for '+cfg.title);
}


/* ===== role-aware, market-intelligence-first home ===== */
function collStage(k){
  const msg={briefed:'18 styles briefed for AW26',studio:'7 styles in Studio',approved:'11 styles approved',gaps:'3 collection gaps — knitwear, transitional layer, kids outerwear'}[k];
  go('whitespace2');
  toast(msg);
}
window.collStage=collStage;

/* ===== Brief object: confirmation drawer before Studio ===== */
let BRIEFS=[
  {id:'BRF-023',name:'Sheer rib knit',created:'Jun 24',owner:'Elena Marchetti',status:'In Studio',sourceTrend:'Sheer rib knit',sourceScore:94,stage:'Accelerating',collection:'AW26 Main',category:'Knitwear',col:'#9A968B',fab:'Rib knit',g:'knit',concepts:3},
  {id:'BRF-022',name:'Architectural wide trouser',created:'Jun 19',owner:'Elena Marchetti',status:'Concept review',sourceTrend:'Architectural wide trouser',sourceScore:89,stage:'Accelerating',collection:'AW26 Main',category:'Tailoring',col:'#4A4944',fab:'Wool',g:'trousers',concepts:2},
  {id:'BRF-021',name:'Unlined chore coat',created:'Jun 12',owner:'Marco Reyes',status:'Approved',sourceTrend:'Unlined chore coat',sourceScore:81,stage:'Emerging',collection:'AW26 Main',category:'Outerwear',col:'#3C4C68',fab:'Twill',g:'coat',concepts:4},
];
const BRIEF_STATUS={'Draft':'var(--ink-3)','Active':'var(--cobalt)','In Studio':'var(--cobalt)','Concept review':'var(--ochre)','Approved':'var(--sage)'};
function renderBriefs(){
  const el=document.getElementById('briefsBody');if(!el)return;
  const active=BRIEFS.filter(b=>b.status!=='Approved').length;
  el.innerHTML=`
    <div class="briefs-intro">
      <p>A brief is the bridge between intelligence and creation. Each one keeps its <b>source opportunity</b>, its place in the collection, and its constraints — so every design traces back to why it started, and forward to what it became.</p>
      <div class="briefs-stat"><span><b>${BRIEFS.length}</b> briefs</span><span><b>${active}</b> active</span><span><b>${BRIEFS.reduce((s,b)=>s+(b.concepts||0),0)}</b> concepts generated</span></div>
    </div>
    <div class="briefs-list">
      ${BRIEFS.map(b=>`<div class="brief-li" onclick="openBriefDetail('${b.id}')">
        <div class="bli-img">${mtile({color:b.col,fabric:b.fab,garmentKey:b.g,img:photoFor(b.g,'Minimal','women')})}</div>
        <div class="bli-body">
          <div class="bli-top"><span class="bli-id">${b.id}</span><span class="bli-status" style="color:${BRIEF_STATUS[b.status]||'var(--ink-3)'};border-color:${BRIEF_STATUS[b.status]||'var(--ink-3)'}">${b.status}</span></div>
          <div class="bli-name">${b.name}</div>
          <div class="bli-lineage"><span class="bli-node">${b.sourceTrend} · ${b.sourceScore}</span><span class="bli-arr">→</span><span class="bli-node">${b.category}</span><span class="bli-arr">→</span><span class="bli-node">${b.concepts} concepts</span></div>
        </div>
        <div class="bli-meta">
          <div class="blim-row"><span>Owner</span>${b.owner.split(' ')[0]}</div>
          <div class="blim-row"><span>Collection</span>${b.collection}</div>
          <div class="blim-row"><span>Created</span>${b.created}</div>
        </div>
        <span class="bli-go">›</span>
      </div>`).join('')}
    </div>`;
}
function openBriefDetail(id){
  const b=BRIEFS.find(x=>x.id===id);if(!b)return;
  openDrawer(`<div class="brief2">
    <div class="brief2-hero">
      <div class="b2h-img">${mtile({color:b.col,fabric:b.fab,garmentKey:b.g,img:photoFor(b.g,'Minimal','women')})}</div>
      <div class="b2h-scrim"></div>
      <div class="b2h-top"><span class="b2h-id">${b.id}</span><span class="b2h-status" style="background:${BRIEF_STATUS[b.status]||'var(--ochre)'}">${b.status.toUpperCase()}</span></div>
      <div class="b2h-foot">
        <div class="b2h-eyebrow">CREATIVE BRIEF</div>
        <h2 class="b2h-title">${b.name}</h2>
        <div class="b2h-lineage"><span class="b2l-node">${b.sourceTrend}</span><span class="b2l-arr">→</span><span class="b2l-node">Brief</span><span class="b2l-arr">→</span><span class="b2l-node ${b.concepts?'b2l-now':''}">${b.concepts} concepts</span></div>
      </div>
    </div>
    <div class="brief2-body">
      <div class="b2-group">
        <div class="b2-gh"><span class="b2-gdot" style="background:var(--ember)"></span>Origin &amp; lineage</div>
        <div class="b2-pair"><span class="b2-k">Source trend</span><span class="b2-v">${b.sourceTrend} · <span style="color:var(--ember-ink)">${b.stage}</span></span></div>
        <div class="b2-pair"><span class="b2-k">Opportunity</span><span class="b2-v">${b.sourceScore}/100</span></div>
        <div class="b2-pair"><span class="b2-k">Collection</span><span class="b2-v">${b.collection}</span></div>
        <div class="b2-pair"><span class="b2-k">Concepts</span><span class="b2-v">${b.concepts} generated in Studio</span></div>
      </div>
      <div class="b2-group b2-owner">
        <div class="b2-owner-l"><div class="b2-av">${b.owner.split(' ').map(w=>w[0]).join('')}</div><div><div class="b2-oname">${b.owner}</div><div class="b2-orole">Owner · status ${b.status}</div></div></div>
        <div class="b2-due"><div class="b2-duek">CREATED</div><div class="b2-duev">${b.created}</div></div>
      </div>
      <div class="brief2-cta">
        <button class="b2-save" onclick="closeDrawer();studioFromOpp('${b.name.replace(/'/g,"\\'")}')">Open in Studio →</button>
        <button class="b2-cancel" onclick="closeDrawer()">Close</button>
      </div>
    </div>
  </div>`);
}
window.renderBriefs=renderBriefs;window.openBriefDetail=openBriefDetail;
function openBrief(trendName){
  const t=TRENDS.find(x=>x.name===trendName);
  const cat=t?t.cat:'Knitwear';
  const id='BRF-'+String(24+BRIEFS.length).padStart(3,'0');
  const score=t?t.score:84, stage=t?lifecycleOf(t).stage:'Accelerating';
  const img=t?photoFor(t.g,t.mood,t.gd):IMG.knit;
  const col=t?t.col:'#9A968B', fab=t?t.fabric:'Rib knit', g=t?t.g:'knit';
  const html=`
    <div class="brief2">
      <div class="brief2-hero">
        <div class="b2h-img">${mtile({color:col,fabric:fab,garmentKey:g,img:img})}</div>
        <div class="b2h-scrim"></div>
        <div class="b2h-top"><span class="b2h-id">${id}</span><span class="b2h-status">DRAFT</span></div>
        <div class="b2h-foot">
          <div class="b2h-eyebrow">CREATIVE BRIEF</div>
          <h2 class="b2h-title">${trendName}</h2>
          <div class="b2h-lineage"><span class="b2l-node">Signal</span><span class="b2l-arr">→</span><span class="b2l-node">Opportunity ${score}</span><span class="b2l-arr">→</span><span class="b2l-node b2l-now">Brief</span></div>
        </div>
      </div>

      <div class="brief2-body">
        <div class="b2-group">
          <div class="b2-gh"><span class="b2-gdot" style="background:var(--ember)"></span>Origin</div>
          <div class="b2-pair"><span class="b2-k">Source trend</span><span class="b2-v">${trendName} · <span style="color:var(--ember-ink)">${stage}</span></span></div>
          <div class="b2-pair"><span class="b2-k">Opportunity score</span><span class="b2-v">${score}/100 · high-confidence</span></div>
          <div class="b2-pair"><span class="b2-k">Collection</span><span class="b2-v">AW26 Main · launches Sep 2026</span></div>
        </div>

        <div class="b2-group">
          <div class="b2-gh"><span class="b2-gdot" style="background:var(--cobalt)"></span>The product</div>
          <div class="b2-pair"><span class="b2-k">Category</span><span class="b2-v">${cat}</span></div>
          <div class="b2-pair"><span class="b2-k">Recommended</span><span class="b2-v">One fine-gauge ${cat.toLowerCase()} style</span></div>
          <div class="b2-pair"><span class="b2-k">Colourways</span><span class="b2-v"><span class="b2-sw" style="background:#3a3a3f"></span>Graphite <span class="b2-sw" style="background:#4a3a4f;margin-left:8px"></span>Aubergine</span></div>
          <div class="b2-flag"><span class="b2-flagk">!</span>Avoid ivory — already over-indexed in the approved collection.</div>
        </div>

        <div class="b2-group">
          <div class="b2-gh"><span class="b2-gdot" style="background:var(--sage)"></span>Constraints</div>
          <div class="b2-chips"><span class="b2-chip">Tonal</span><span class="b2-chip">Tactile</span><span class="b2-chip">Transparency adjacency</span></div>
          <div class="b2-pair" style="margin-top:10px"><span class="b2-k">Commercial</span><span class="b2-v">Entry price &lt; €300 · DTC + retail<br><span style="color:var(--ochre);font-size:11px">Not wholesale yet — demand unproven</span></span></div>
        </div>

        <div class="b2-group b2-owner">
          <div class="b2-owner-l"><div class="b2-av">EM</div><div><div class="b2-oname">Elena Marchetti</div><div class="b2-orole">Creative Director · owner</div></div></div>
          <div class="b2-due"><div class="b2-duek">DEADLINE</div><div class="b2-duev">Concept review · Jul 3</div></div>
        </div>

        <div class="brief2-cta">
          <button class="b2-save" onclick="saveBrief('${id}','${trendName.replace(/'/g,"\\'")}')">Save brief &amp; open Studio →</button>
          <button class="b2-cancel" onclick="closeDrawer()">Cancel</button>
        </div>
        <p class="brief2-note">Saved as a persistent object — it keeps its source opportunity, collection and constraints, so the design work always traces back to why it started.</p>
      </div>
    </div>`;
  openDrawer(html);
}
function saveBrief(id,name){
  const t=TRENDS.find(x=>x.name===name);
  BRIEFS.unshift({
    id,name,created:'Today',owner:'Elena Marchetti',status:'Active',
    sourceTrend:name,
    sourceScore:t?t.score:84,
    stage:t?lifecycleOf(t).stage:'Accelerating',
    collection:'AW26 Main',
    category:t?t.cat:'Knitwear',
    col:t?t.col:'#9A968B',fab:t?t.fabric:'Rib knit',g:t?t.g:'knit',
    concepts:0
  });
  closeDrawer();
  toast('Brief '+id+' saved · assigned to Elena · open in Studio');
  studioFromOpp(name);
}
function resolveAction(kind,choice){
  if(choice==='approve'){
    DECISION_HISTORY.unshift({id:Date.now(),date:'Today',title:'Ribbed merino tank — reorder',rec:'Reorder · 180 units',decision:'accepted',why:'92% sell-through; stock-out risk in 12 days. Approved as recommended.',outcome:'testing',outcomeVal:'→ on order',outcomeClass:'warn',img:IMG.knit,learn:'Reorder approved at Atelier-recommended depth — outcome tracked vs the do-nothing baseline.'});
    toast('Approved 180 units · logged to Decision Memory');
    flashDecisionMemory();
    return;
  }
  const verb=choice==='adjust'?'Adjust':'Decline';
  const reasons=choice==='adjust'?['Different quantity than recommended','Splitting across colourways','Timing — wait for next drop','Budget constraint this cycle']:['Demand will not hold','Margin too thin','Capacity / lead-time risk','Strategic — exiting this style'];
  const html=`
    <div class="dr-card">
      <div class="ey" style="color:var(--cobalt)">${verb} reorder · Ribbed merino tank</div>
      <h2 style="font-size:21px">Why are you ${choice==='adjust'?'adjusting':'declining'} this?</h2>
      <p style="font-size:12.5px;color:#cfccbf;margin:-4px 0 14px">A short reason lets Atelier learn from the decision instead of just recording an outcome.</p>
      <div class="opts" style="flex-direction:column;gap:7px;display:flex">
        ${reasons.map(r=>`<button class="opt" style="text-align:left;width:100%" onclick="logDecision('${verb}','${r.replace(/'/g,"\\'")}','Ribbed merino tank — reorder')">${r}</button>`).join('')}
      </div>
    </div>`;
  openDrawer(html);
}
function logDecision(verb,reason,title){
  const dec=verb==='Decline'?'rejected':verb==='Adjust'?'modified':'accepted';
  DECISION_HISTORY.unshift({
    id:Date.now(),date:'Today',title:title||'Reorder decision',
    rec:'Atelier recommendation',decision:dec,
    why:verb+'ed — '+reason,
    outcome:'learning',outcomeVal:'Logged',outcomeClass:'warn',img:IMG.knit,
    learn:'Reason captured: "'+reason+'". Atelier will weight this when similar decisions arise.'
  });
  closeDrawer();
  toast(verb+' logged · "'+reason+'" → Decision Memory');
  flashDecisionMemory();
}
function flashDecisionMemory(){
  setTimeout(()=>{go('decisions');setTimeout(()=>{const first=document.querySelector('#decisionBody .dec-item');if(first){first.style.transition='background .3s';first.style.background='var(--cobalt-wash)';setTimeout(()=>first.style.background='',1400);}},120);},450);
}
window.flashDecisionMemory=flashDecisionMemory;
window.openBrief=openBrief;window.saveBrief=saveBrief;window.resolveAction=resolveAction;window.logDecision=logDecision;

/* ===== openable scores: every score traces to factors, weights, freshness, gaps ===== */
// Score transparency — derived from the actual trend so the drawer ALWAYS matches the chip.
function scoreModel(key,t){
  const d=t.demand, lc=lifecycleOf(t), covered=CATALOG.some(p=>p.g===t.g&&p.cat===t.cat);
  // confidence derived from real evidence
  const conf = (t.signals>=700&&t.matches>=10)?'High':(t.signals>=400)?'Medium':'Limited';
  const confCol = conf==='High'?'var(--cobalt)':conf==='Medium'?'var(--ochre)':'var(--ink-3)';
  if(key==='opportunity') return {title:'Opportunity score',val:d.d+'/100',col:'var(--ember)',
    factors:[
      ['Market momentum','30%',t.yoy+' demand over 90d',lc.stage==='Declining'?'var(--clay)':'var(--sage)'],
      ['Brand relevance','25%',d.f+'/100 fit to your codes',d.f>=85?'var(--sage)':'var(--ochre)'],
      ['Collection need','25%',covered?'Already in your line':'Fills an open gap',covered?'var(--ochre)':'var(--sage)'],
      ['Competitor whitespace','20%',t.matches>=14?'Crowded — '+t.matches+' rivals':t.matches+' rivals · thin',t.matches>=14?'var(--clay)':'var(--sage)']],
    fresh:'Recomputed 4h ago',
    missing:'Kids demand inferred from women/men — no first-party kids search.',
    human:'Not adjusted by your team yet.'};
  if(key==='brandfit') return {title:'Brand Fit',val:d.f+'/100',col:'var(--ember)',
    factors:[
      ['Code overlap','40%','Tonal + tactile match',d.f>=85?'var(--sage)':'var(--ochre)'],
      ['Catalog precedent','30%',covered?'Direct precedent in line':'Adjacent to a franchise','var(--sage)'],
      ['Guardrail conflicts','20%','Ivory over-indexed','var(--ochre)'],
      ['Team confirmations','10%','3 codes team-confirmed','var(--sage)']],
    fresh:'Updates when Brand DNA changes',
    missing:'“Japanese-influenced” code unconfirmed — slightly lowers certainty.',
    human:'Reflects your last DNA correction.'};
  // confidence — folds data quality in as a factor (not a separate always-green chip)
  return {title:'Confidence',val:conf,col:confCol,
    factors:[
      ['Source diversity','30%','4 independent source groups','var(--sage)'],
      ['Evidence volume','25%',t.signals.toLocaleString()+' signals · '+t.matches+' refs',t.signals>=700?'var(--sage)':'var(--ochre)'],
      ['Data quality','25%','Sales 18m · stock 32m · 93% attrs','var(--sage)'],
      ['Historical accuracy','20%','78% on similar past calls','var(--sage)']],
    fresh:'Live',
    missing: conf!=='High' ? 'Competitor coverage incomplete for 2 markets — caps confidence.' : 'None material — strong coverage across sources.',
    human:'Not overridden.'};
}
let lastHeroForScore=null;
function openScore(key){
  const t=lastHeroForScore||[...TRENDS].filter(x=>x.brand).sort((a,b)=>b.score-a.score)[0];
  const m=scoreModel(key,t);
  openDrawer(`<div class="dr-card">
    <div class="ey" style="color:var(--cobalt)">How this score is calculated · ${t.name}</div>
    <h2 style="font-size:24px;margin-bottom:2px">${m.title}</h2>
    <div style="font-family:var(--serif);font-size:34px;color:${m.col};margin-bottom:16px">${m.val}</div>
    <div class="score-factors">
      ${m.factors.map(f=>`<div class="sf-row">
        <div class="sf-top"><span class="sf-name">${f[0]}</span><span class="sf-weight">${f[1]}</span></div>
        <div class="sf-bar"><i style="width:${f[1]};background:${f[3]}"></i></div>
        <div class="sf-detail">${f[2]}</div>
      </div>`).join('')}
    </div>
    <div class="score-meta">
      <div class="sm-row"><span class="sm-k">Freshness</span><span>${m.fresh}</span></div>
      <div class="sm-row"><span class="sm-k">Missing evidence</span><span style="color:var(--ochre)">${m.missing}</span></div>
      <div class="sm-row"><span class="sm-k">Human correction</span><span>${m.human}</span></div>
    </div>
    <p style="font-size:11px;color:#86847a;margin-top:14px;line-height:1.5">The written reasoning carries more weight than the number. Weights show the model structure — every score is inspectable and correctable, never a black box.</p>
  </div>`);
}
window.openScore=openScore;

function openGlobalIntel(){
  openDrawer(`<div class="dr-card">
    <div class="ey" style="color:var(--cobalt)">Where this comes from</div>
    <h2 style="font-size:24px;margin-bottom:3px">Global intelligence</h2>
    <p style="font-size:12.5px;color:#cfccbf;margin:-2px 0 16px;line-height:1.5">Every figure on the radar summary is filtered to Meridian's markets, codes and active collection — here's the basis.</p>
    <div class="gi-stats">
      ${[['14','accelerating','trends crossing the growth threshold this cycle'],['6','relevant to Meridian','after filtering for brand fit ≥ 70 and category overlap'],['3','nearing saturation','competitor coverage now high in your tier'],['2','require action','open window + collection need + you have no entry']].map(s=>`<div class="gi-stat"><div class="gi-n">${s[0]}</div><div class="gi-l">${s[1]}</div><div class="gi-d">${s[2]}</div></div>`).join('')}
    </div>
    <div class="gi-meta">
      <div class="gi-row"><span class="gi-k">Markets</span><span>Seoul · Tokyo · London · Paris · Copenhagen · NYC · LA — your priority set</span></div>
      <div class="gi-row"><span class="gi-k">Period</span><span>Rolling 90 days, week-over-week momentum</span></div>
      <div class="gi-row"><span class="gi-k">Baseline</span><span>Each trend vs its own 12-month trailing average, not absolute volume</span></div>
      <div class="gi-row"><span class="gi-k">Sources</span><span>4 groups — social imagery, search &amp; commerce, runway, competitor sites &amp; resale</span></div>
      <div class="gi-row"><span class="gi-k">Updated</span><span style="color:var(--sage)">4 hours ago · next refresh tonight</span></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:18px">
      <button class="btn" onclick="closeDrawer();go('trends')">Open full radar →</button>
      <button class="btn ghost" onclick="closeDrawer()">Close</button>
    </div>
    <p style="font-size:11px;color:#86847a;margin-top:14px;line-height:1.5">In production these draw from connected data; here the figures are illustrative but internally consistent. The point is that every number is traceable to a market, a period and a source.</p>
  </div>`);
}
window.openGlobalIntel=openGlobalIntel;

function openMetric(k){
  const M={
    rev:{title:'Net revenue · last 30 days',val:'€482k',delta:'+18.2% vs prior 30 days',dcol:'var(--sage)',
      basis:'Sum of paid orders, net of refunds and discounts, for the Meridian USA storefront.',
      source:'Shopify orders', period:'Jun 1–30 vs May 2–31', kind:'Observed',
      note:'Wholesale revenue is not included — DTC + retail only.'},
    st:{title:'Sell-through · AW25 in-season',val:'71%',delta:'+6.4pts vs week-6 plan',dcol:'var(--sage)',
      basis:'Units sold ÷ units received, averaged across active in-season styles, weighted by buy depth.',
      source:'Shopify inventory + orders', period:'Rolling, as of today', kind:'Observed',
      note:'Excludes pre-order and made-to-order styles.'},
    cover:{title:'Stock cover',val:'34 days',delta:'−5 days vs last week',dcol:'var(--clay)',
      basis:'On-hand units ÷ trailing 14-day sales velocity, averaged across active styles.',
      source:'Shopify inventory', period:'Trailing 14-day velocity', kind:'Calculated',
      note:'Falling cover is usually good (demand up) but flags reorder timing — 4 styles now under 1 week.'},
    ret:{title:'Return rate',val:'8.1%',delta:'+1.2pts vs prior 30 days',dcol:'var(--clay)',
      basis:'Returned units ÷ delivered units, last 30 days, all categories.',
      source:'Shopify returns', period:'Jun 1–30', kind:'Observed',
      note:'The rise concentrates in the bias slip dress — a fit issue, not a quality one.'}
  };
  const m=M[k];if(!m)return;
  openDrawer(`<div class="dr-card">
    <div class="ey" style="color:var(--cobalt)">How this number is derived</div>
    <h2 style="font-size:22px;margin-bottom:2px">${m.title}</h2>
    <div style="display:flex;align-items:baseline;gap:11px;margin-bottom:16px">
      <span style="font-family:var(--serif);font-size:34px;color:#fff">${m.val}</span>
      <span style="font-family:var(--d);font-size:12px;font-weight:700;color:${m.dcol}">${m.delta}</span>
    </div>
    <div class="gi-meta" style="border-top:none;padding-top:0">
      <div class="gi-row"><span class="gi-k">What it is</span><span>${m.basis}</span></div>
      <div class="gi-row"><span class="gi-k">Source</span><span>${m.source}</span></div>
      <div class="gi-row"><span class="gi-k">Period</span><span>${m.period}</span></div>
      <div class="gi-row"><span class="gi-k">Type</span><span>${m.kind}</span></div>
      <div class="gi-row"><span class="gi-k">Note</span><span style="color:var(--ochre)">${m.note}</span></div>
    </div>
    <div style="display:flex;gap:8px;margin-top:18px">
      <button class="btn" onclick="closeDrawer();go('analytics')">Open in analytics →</button>
      <button class="btn ghost" onclick="closeDrawer()">Close</button>
    </div>
    <p style="font-size:11px;color:#86847a;margin-top:14px;line-height:1.5">In production this reads live from your connected Shopify store. Here the figures are illustrative but the derivation is real — every number names its source, period and whether it's observed or calculated.</p>
  </div>`);
}
window.openMetric=openMetric;

function renderHome(){
  const covered=new Set(CATALOG.map(p=>p.g+'|'+p.cat));
  const scored=[...TRENDS].filter(t=>t.brand).map(t=>{
    const lc=lifecycleOf(t);
    const stageBoost={Emerging:6,Accelerating:12,Peaking:2,Declining:-20}[lc.stage]||0;
    const dupPenalty=covered.has(t.g+'|'+t.cat)?14:0;
    return {t,lc,rank:t.score+stageBoost-dupPenalty};
  }).sort((a,b)=>b.rank-a.rank);
  const hero=scored[0].t, lc=scored[0].lc;
  const cfg=ROLES[currentRole];
  const esc=s=>s.replace(/'/g,"\\'");

  function deriveConf(t){
    if(t.signals>=700 && t.matches>=10) return {lbl:'High',col:'var(--cobalt)'};
    if(t.signals>=400) return {lbl:'Medium',col:'var(--ochre)'};
    return {lbl:'Emerging',col:'var(--ink-3)'};
  }
  const hconf=deriveConf(hero);

  // combined recommendation: NOT lifecycle alone. weighs momentum, brand fit, collection need,
  // saturation, commercial readiness → Explore / Test / Develop / Avoid
  const recommend=recommendTrend;

  const ICN_REV='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M3 17l5-5 4 3 8-8M21 7v5M21 7h-5"/></svg>';
  const ICN_ST='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M9 11l3 3 8-8M20 12v6a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h9"/></svg>';
  const ICN_RISK='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>';
  const ICN_COLL='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>';

  // ---- HEADER: brand command centre (not collection workspace) ----
  const header=`
    <div class="cmd-header">
      <div class="cmd-top">
        <div class="cmd-greet">
          <div class="cmd-morning">Good morning, Elena</div>
          <div class="cmd-sub">Four decisions need attention before the AW26 concept review on Jul 3.</div>
        </div>
        <div class="cmd-ctx">
          <span class="ctx-pill">Meridian</span>
          <span class="ctx-pill">AW26 Main</span>
          <span class="ctx-pill">W · M · Kids</span>
          <span class="ctx-pill">USA</span>
          <span class="ctx-pill">90 days</span>
          <button class="wf-health" onclick="toast('Data Health: 7% of styles missing attributes')"><span class="wf-dot"></span>Data: Good · 18m</button>
        </div>
      </div>
      <div class="kpi-strip">
        <button class="kpi-card" onclick="go('analytics')">
          <div class="kpi-ic" style="background:#EDF3EF;color:var(--sage)">${ICN_REV}</div>
          <div class="kpi-body"><div class="kpi-l">Revenue · 30d</div><div class="kpi-v">€482k <span class="kpi-d up">▲ 12%</span></div></div>
          <span class="kpi-go">›</span>
        </button>
        <button class="kpi-card" onclick="go('analytics')">
          <div class="kpi-ic" style="background:var(--cobalt-wash);color:var(--cobalt)">${ICN_ST}</div>
          <div class="kpi-body"><div class="kpi-l">Sell-through</div><div class="kpi-v">71% <span class="kpi-d up">▲ 6.4pts</span></div></div>
          <span class="kpi-go">›</span>
        </button>
        <button class="kpi-card" onclick="openProduct('Boxy poplin shirt')">
          <div class="kpi-ic" style="background:var(--clay-wash);color:var(--clay)">${ICN_RISK}</div>
          <div class="kpi-body"><div class="kpi-l">Inventory risk</div><div class="kpi-v">4 styles <span class="kpi-d warn">overstock</span></div></div>
          <span class="kpi-go">›</span>
        </button>
        <button class="kpi-card" onclick="go('whitespace2')">
          <div class="kpi-ic" style="background:var(--ochre-wash);color:var(--ochre)">${ICN_COLL}</div>
          <div class="kpi-body"><div class="kpi-l">AW26 readiness</div><div class="kpi-v">64% <span class="kpi-d">on schedule</span></div></div>
          <span class="kpi-go">›</span>
        </button>
      </div>
    </div>`;

  // ---- UNIFIED PRIORITY QUEUE — one ranked list replacing Today strip + This Week + Needs Attention ----
  // Sorted by: urgency first, then impact, then deadline window.
  // Each item: rank, type, what, why, impact, confidence, owner, deadline, action.
  // Source tags on every item so evidence composition is visible without drilling.
  const priorities=[
    {
      tag:'RESTOCK', typeCol:'var(--clay)', typeBg:'var(--clay-wash)',
      short:'Ribbed merino tank — bone',
      why:'92% sell-through in 9 days; under a week of cover left.',
      action:`<button class="pa-btn" onclick="resolveAction('reorder','approve')">Reorder 180</button>`
    },
    {
      tag:'BRIEF', typeCol:'var(--ochre)', typeBg:'var(--ochre-wash)',
      short:'Lightweight knitwear gap',
      why:'Missing from AW26 with concept review in 4 days.',
      action:`<button class="pa-btn" onclick="openBrief('Sheer rib knit')">Create brief</button>`
    },
    {
      tag:'REVIEW', typeCol:'var(--cobalt)', typeBg:'var(--cobalt-wash)',
      short:'3 sheer-knit concepts ready',
      why:'Three directions generated in Studio, awaiting your call.',
      action:`<button class="pa-btn" onclick="go('studio')">Open in Studio</button>`
    },
    {
      tag:'SIGNAL', typeCol:'var(--ink)', typeBg:'var(--paper-2)',
      short:'Washed indigo is moving',
      why:'Social saves +3.1× vs two competitors in a 4–6 week window.',
      action:`<button class="pa-btn" onclick="openOpp('Washed indigo barrel jean')">See signals</button>`
    },
  ];

  const prioQueue=`
    <div class="pa-card">
      <div class="pa-head"><h3>Prioritised actions</h3><a onclick="go('decisions')">${priorities.length} open ›</a></div>
      <div class="pa-list">
        ${priorities.map(p=>`<div class="pa-row">
          <span class="pa-tag" style="color:${p.typeCol};background:${p.typeBg||'var(--paper-2)'}">${p.tag||p.type}</span>
          <div class="pa-main">
            <div class="pa-what">${p.short||p.what}</div>
            <div class="pa-why">${p.why}</div>
          </div>
          <div class="pa-act">${p.action}</div>
        </div>`).join('')}
      </div>
      <a class="pa-all" onclick="go('decisions')">View all actions ›</a>
    </div>`;

  // ---- ALSO ON THE TABLE — secondary opportunities beside the hero ----
  // ---- OTHER OPPORTUNITIES — next-ranked trends NOT already a decision in the queue ----
  const INTERP_SHORT2={'Architectural wide trouser':'Widening category, strong repeat-buyer rate.','Unlined chore coat':'Early menswear signal that fits your utility codes.','Bias-cut slip dress':'At peak and already core — defend rather than expand.','Soft-shoulder blazer':'Fits soft tailoring; menswear depth still unproven.','Garment-dyed mini tee':'Quiet kids demand in a category you under-serve.'};
  // Queue already owns: knitwear gap, sheer concepts, washed indigo. So pull the others.
  const queued=new Set(['Sheer rib knit','Washed indigo barrel jean']);
  const alsoTrends=scored.map(s=>s.t).filter(t=>t.name!==hero.name && !queued.has(t.name)).slice(0,4);
  const ALSO_TAG={Develop:['DEVELOP','var(--sage)'],Test:['TEST','var(--ochre)'],Explore:['EXPLORE','var(--cobalt)'],Watch:['WATCH','var(--ink-3)'],Avoid:['HOLD','var(--clay)']};
  const alsoPanel=`
    <div class="also-card">
      <div class="also-head">OTHER OPPORTUNITIES</div>
      ${alsoTrends.map(t=>{const r=recommend(t);const tg=ALSO_TAG[r.action]||['EXPLORE','var(--cobalt)'];return `<button class="also-row" onclick="lastHeroForScore=TRENDS.find(x=>x.name==='${esc(t.name)}');openOpp('${esc(t.name)}')">
        <span class="also-tag" style="color:${tg[1]}">${tg[0]}</span>
        <div class="also-img">${mtile({color:t.col,fabric:t.fabric,garmentKey:t.g,img:photoFor(t.g,t.mood,t.gd)})}</div>
        <div class="also-body"><div class="also-name">${t.name}</div><div class="also-note">${INTERP_SHORT2[t.name]||(t.cat+' · '+t.demand.d+' demand, '+t.demand.f+' brand fit.')}</div></div>
        <span class="also-go">›</span>
      </button>`;}).join('')}
      <a class="also-all" onclick="go('whitespace')">View all opportunities ›</a>
    </div>`;

  // ---- BUSINESS SNAPSHOT — each metric opens an honest explanation of its basis ----
  const numbers=[
    {k:'rev',l:'Net revenue · 30d',v:'€482k',d:'+18.2% vs prior 30d',dir:'up'},
    {k:'st',l:'Sell-through',v:'71%',d:'+6.4pts · ahead of wk6 plan',dir:'up'},
    {k:'cover',l:'Stock cover',v:'34 days',d:'−5 days · tightening',dir:'bad'},
    {k:'ret',l:'Return rate',v:'8.1%',d:'+1.2pts · watch fit',dir:'bad'},
  ];
  const numbersCard=`
    <div class="nm-card">
      <div class="nm-head"><h3>Business snapshot</h3><a onclick="go('analytics')">Full analytics ›</a></div>
      <div class="nm-grid">
        ${numbers.map(n=>`<button class="nm-tile" onclick="openMetric('${n.k}')">
          <div class="nm-l">${n.l}</div>
          <div class="nm-v">${n.v}</div>
          <div class="nm-foot"><span class="nm-d ${n.dir==='up'?'up':'bad'}">${n.d}</span><span class="nm-inspect">how ⌕</span></div>
        </button>`).join('')}
      </div>
    </div>`;

  // ---- hero narrative computations (dynamic, derived from actual ranked hero) ----
  const hrec=recommend(hero);
  const HERO_NARR={
    'Sheer rib knit':{fit:"fits Meridian's tactile, refined codes — an adjacency to your knit franchise, not a departure",gap:'you already have knitwear, so this is a sheer evolution — test before depth, avoid the over-indexed ivory'},
    'Architectural wide trouser':{fit:'extends your strongest franchise — architectural tailoring is core, not adjacent',gap:'tailoring is well-covered; this is depth not whitespace — differentiate on cut'},
    'Unlined chore coat':{fit:'fits your utility-minimal codes and opens menswear outerwear carefully',gap:'AW26 has no transitional layer in menswear — a genuine gap'},
    'Washed indigo barrel jean':{fit:'aligns with your wash story, though denim sits at the edge of your codes',gap:'no denim entry in AW26, but two competitors just launched — move or miss it'},
    'Bias-cut slip dress':{fit:'is core DNA — bias and tonal restraint define the brand',gap:'dresses are already over-indexed; defend the franchise rather than expand it'},
    'Soft-shoulder blazer':{fit:'fits soft-tailoring codes; menswear depth is still unproven for you',gap:'menswear tailoring is thin — a measured test, not a commitment'},
    'Garment-dyed mini tee':{fit:'sits in a kids category you under-serve, in your tonal language',gap:'kids knitwear is nearly empty — quiet demand worth a small test'}
  };
  const hn=HERO_NARR[hero.name]||{fit:`is ${hero.demand.f>=85?'a strong fit for':'an adjacency to'} your ${hero.mood.toLowerCase()} codes`,gap:`${hrec.need==='High'?'fills an open slot in':'adds depth to'} the AW26 ${hero.cat.toLowerCase()} mix`};
  const heroMkts=hero.geo||'priority markets';
  const heroCols=(hero.sw||[]).slice(0,2).map(colName);
  const heroColTxt=heroCols.length===2?`${heroCols[0]} & ${heroCols[1].toLowerCase()}`:'your tonal palette';
  const RECVERB={Develop:'Develop',Test:'Test',Explore:'Explore',Watch:'Watch',Avoid:'Reconsider'};
  const recVerb=RECVERB[hrec.action]||'Explore';
  const recScope={
    Develop:`a focused brief — one ${hero.cat.toLowerCase()} style in ${heroColTxt}, entry-priced`,
    Test:`a small test — one or two ${hero.cat.toLowerCase()} pieces in ${heroColTxt} before committing depth`,
    Explore:`an exploratory concept in ${heroColTxt} — gather evidence before a full brief`,
    Watch:`nothing yet — keep it on the radar until the signal strengthens`,
    Avoid:`holding off — the combined read does not justify a move this season`
  }[hrec.action]||`an exploratory concept in ${heroColTxt}`;

    const heroSection=`
    <div class="dh-left">
      <div class="dh-img">${mtile({color:hero.col,fabric:hero.fabric,garmentKey:hero.g,img:photoFor(hero.g,hero.mood,hero.gd)})}</div>
      <div class="dh-overlay"></div>
      <div class="dh-content">
        <div class="dh-eyebrow"><span class="dh-static">THE OPPORTUNITY THIS WEEK</span><span class="dh-stage">${lc.stage}</span></div>
        <h2 class="dh-edtitle">${hero.name} is <em>${lc.stage.toLowerCase()}</em></h2>
        <div class="dh-story">
          <p>Strongest in ${heroMkts}, with competitor coverage ${hero.matches>=14?'already building':'still thin'}.</p>
          <p>It ${hn.fit}.</p>
          <p>For your collection, ${hn.gap}.</p>
        </div>
        <p class="dh-rec"><span class="dh-recmark">${recVerb}</span> ${recScope}.</p>
        <div class="dh-ctas">
          ${hrec.action==='Watch'||hrec.action==='Avoid'
            ? `<button class="dh-btn-p" onclick="lastHeroForScore=TRENDS.find(x=>x.name==='${esc(hero.name)}');openOpp('${esc(hero.name)}')">See the evidence →</button>`
            : `<button class="dh-btn-p" onclick="openBrief('${esc(hero.name)}')">＋ Create Brief →</button>`}
          <button class="dh-btn-s" onclick="lastHeroForScore=TRENDS.find(x=>x.name==='${esc(hero.name)}');openOpp('${esc(hero.name)}')">Why now — scores &amp; evidence</button>
        </div>
        <div class="dh-mini">Opportunity <b>${hero.demand.d}</b><span class="dhm-sep">·</span>Brand Fit <b>${hero.demand.f}</b><span class="dhm-sep">·</span>Confidence <b style="color:${hconf.lbl==='High'?'#8fd49f':'#E7B96B'}">${hconf.lbl}</b><span class="dhm-sep">·</span>${hero.signals.toLocaleString()} signals · ${hero.matches} refs<span class="dhm-sep">·</span>updated 4h<span class="dhm-sep">·</span><span class="hero-src">Social</span><span class="hero-src">Search</span><span class="hero-src">Competitor set</span></div>
      </div>
    </div>`;

  // ---- NEEDS ATTENTION — typed items with full team meta, one inline-executable ----
  const attnQueue=`
    <div class="dq-card">
      <div class="dq-head"><h3>Needs attention</h3><a onclick="go('decisions')">All 7 →</a></div>
      <div class="dq-item">
        <div class="dq-top"><span class="dq-type type-decision">DECISION</span><span class="dq-due over">Due yesterday</span></div>
        <div class="dq-obj">Reorder · Ribbed merino tank — bone</div>
        <div class="dq-reason">May stock out in 12 days on M/L. 92% sell-through.</div>
        <div class="dq-ownmeta"><span class="dqo-k">Owner</span> Vicky<span class="dqo-sep">·</span><span class="dqo-k">Impact</span> 120–160 units of missed demand</div>
        <div class="dq-inline">
          <button class="dqi-approve" onclick="resolveAction('reorder','approve')">Approve 180</button>
          <button class="dqi-alt" onclick="resolveAction('reorder','adjust')">Adjust</button>
          <button class="dqi-alt" onclick="resolveAction('reorder','decline')">Decline</button>
        </div>
      </div>
      <div class="dq-item">
        <div class="dq-top"><span class="dq-type type-review">REVIEW</span><span class="dq-window">Ready now</span></div>
        <div class="dq-obj">3 concepts ready for approval</div>
        <div class="dq-reason">Sheer knit direction — 3 variants generated and awaiting your call.</div>
        <div class="dq-ownmeta"><span class="dqo-k">Owner</span> Elena<span class="dqo-sep">·</span><span class="dqo-k">Status</span> awaiting review<span class="dqo-sep">·</span><span class="dqo-k">Updated</span> 2h ago</div>
        <div class="dq-foot"><span class="dq-conf" style="color:var(--cobalt)">● Creative review</span><button class="dq-btn" onclick="go('studio')">Open comparison</button></div>
      </div>
      <div class="dq-item">
        <div class="dq-top"><span class="dq-type type-eval">EVALUATE</span><span class="dq-window">4–6 week window</span></div>
        <div class="dq-obj">Washed indigo movement</div>
        <div class="dq-reason">Social saves up 3.1×; two competitors launched indigo capsules.</div>
        <div class="dq-ownmeta"><span class="dqo-k">Owner</span> Unassigned<span class="dqo-sep">·</span><span class="dqo-k">Status</span> new signal<span class="dqo-sep">·</span><span class="dqo-k">Detected</span> this week</div>
        <div class="dq-foot"><span class="dq-conf" style="color:var(--ochre)">● Medium confidence</span><button class="dq-btn" onclick="openOpp('Washed indigo barrel jean')">Review</button></div>
      </div>
    </div>`;

  // ---- 4. COLLECTION PULSE — diagnostic, plain conclusion ----
  const collPulse=`
    <div class="dec-sec-head"><div><h3>Collection pulse</h3><div class="dsh-sub">AW26 Main · launches Sep 2026</div></div><a onclick="go('whitespace2')">Open →</a></div>
    <div class="cp2">
      <div class="cp2-verdict">AW26 is <b>on schedule</b>, but dresses are overrepresented and lightweight knitwear is missing.</div>

      <div class="cp2-grid">
        <div class="cp2-left">
          <div class="cp2-progress" onclick="go('whitespace2')">
            <div class="cp2p-top"><span class="cp2p-pct">64%</span><span class="cp2p-lbl">of 42 styles approved</span></div>
            <div class="cp2p-track"><i style="width:64%"></i></div>
            <div class="cp2p-legend">
              <span class="cp2l"><i style="background:var(--sage)"></i>27 approved</span>
              <span class="cp2l"><i style="background:var(--cobalt)"></i>8 in concept</span>
              <span class="cp2l"><i style="background:var(--ochre)"></i>3 awaiting</span>
              <span class="cp2l"><i style="background:var(--clay)"></i>4 unfilled</span>
            </div>
          </div>

          <div class="cp2-mix">
            <div class="cp2-mixhead">Category mix <span>vs target</span></div>
            ${[['Dresses',62,48,'#2b2a24'],['Tailoring',18,22,'#6f6d63'],['Knitwear',8,18,'#a8a59a'],['Outerwear',8,8,'#5a6b86'],['Other',4,4,'#b0875f']].map(([n,v,t])=>{const d=v-t;const flag=d>=8?'over':d<=-8?'under':'';return `<div class="cp2m-row">
              <span class="cp2m-n">${n}</span>
              <div class="cp2m-track"><i style="width:${Math.round(v/62*100)}%;background:${flag==='over'?'var(--ochre)':flag==='under'?'var(--clay)':'var(--ink-3)'}"></i></div>
              <span class="cp2m-v">${v}%</span>
              <span class="cp2m-d ${flag}">${flag==='over'?'+'+d:flag==='under'?d:'on target'}</span>
            </div>`;}).join('')}
          </div>
        </div>

        <div class="cp2-right">
          <div class="cp2-flag clay"><span>Missing category</span><b>Lightweight knitwear</b></div>
          <div class="cp2-flag ochre"><span>Repetition</span><b>2 near-duplicate slips</b></div>
          <div class="cp2-flag sage"><span>Novelty</span><b>Healthy · 38% new</b></div>
          <div class="cp2-milestone"><span>NEXT</span>Concept review · Jul 3 → Assortment lock · Jul 15</div>
        </div>
      </div>
    </div>`;

  // ---- 5. PERFORMANCE EXCEPTIONS — only off-target, with recommendation ----
  const exceptions=[
    {n:'Bias slip dress — ink',img:IMG.slip,g:'dress',c:'#1B1A14',what:'Sell-through 14pts below target at week 5',detail:'Returns concentrated around fit.',rec:'Review fit feedback before adding a colourway.',sev:'clay',ref:'Bias slip dress'},
    {n:'Ribbed merino tank — bone',img:IMG.knit,g:'knit',c:'#E7E1D3',what:'92% sell-through, under 1 week cover',detail:'M/L sizes nearly gone.',rec:'Reorder before the campaign pulls demand.',sev:'sage',ref:'Ribbed merino tank — bone'},
    {n:'Boxy poplin shirt — clay',img:IMG.corset,g:'tee',c:'#B07A5B',what:'19% sell-through at week 6 · 88d cover',detail:'Slowest style in the line.',rec:'Mark down or pull from reorder.',sev:'clay',ref:'Boxy poplin shirt'},
  ];
  const sevCol={clay:'var(--clay)',sage:'var(--sage)',ochre:'var(--ochre)'};
  const performance=`
    <div class="dec-sec-head" style="margin-top:4px"><div><h3>Performance exceptions</h3><div class="dsh-sub">Only the products that are off-target — not the whole dashboard</div></div><a onclick="go('analytics')">Full analytics →</a></div>
    <div class="exc-list">
      ${exceptions.map(e=>`<button class="exc-row" onclick="openProduct('${e.ref.replace(/'/g,"\\'")}')">
        <div class="exc-img">${mtile({color:e.c,fabric:'Satin',garmentKey:e.g,img:e.img})}</div>
        <div class="exc-body">
          <div class="exc-name">${e.n}</div>
          <div class="exc-what" style="color:${sevCol[e.sev]}">${e.what}</div>
          <div class="exc-detail">${e.detail}</div>
          <div class="exc-rec"><span class="exc-rk">Recommendation</span> ${e.rec}</div>
        </div>
        <span class="exc-arr">›</span>
      </button>`).join('')}
    </div>`;

  // ---- 6. GLOBAL TREND RADAR — combined recommendation, not lifecycle alone ----
  const accel=scored.find(s=>s.lc.stage==='Accelerating'&&s.t!==hero);
  const peaking=scored.find(s=>s.lc.stage==='Peaking');
  const declining=scored.find(s=>s.lc.stage==='Declining');
  const emerging=scored.find(s=>s.lc.stage==='Emerging'&&s.t!==hero);
  const used=new Set([hero,accel?.t,peaking?.t].filter(Boolean));
  const MKTS={'Sheer rib knit':'Seoul · Paris','Architectural wide trouser':'Milan · NYC','Washed indigo barrel jean':'LA · London','Bias-cut slip dress':'Paris · Copenhagen','Unlined chore coat':'Tokyo · Berlin','Soft-shoulder blazer':'Florence · Seoul','Garment-dyed mini tee':'Amsterdam · NYC'};
  const INTERP={'Architectural wide trouser':'Strong global demand, but already well represented in your line.','Bias-cut slip dress':'At peak and already core — defend, don\'t expand.','Unlined chore coat':'Early menswear signal that fits your utility codes — worth watching.','Soft-shoulder blazer':'Fits soft-tailoring codes; menswear depth still unproven.','Washed indigo barrel jean':'Open denim window aligning with your wash story.','Garment-dyed mini tee':'Quiet kids demand in a category you under-serve.'};
  const third=declining?{t:declining.t,band:'Saturating'}:(emerging&&!used.has(emerging.t)?{t:emerging.t,band:'Newly relevant'}:null);
  const radar=[
    accel?{t:accel.t,band:'Strengthening'}:null,
    peaking?{t:peaking.t,band:'Peaking'}:null,
    third,
  ].filter(Boolean);
  const axCol=v=>v==='High'||v==='Ready'?'var(--sage)':v==='Medium'?'var(--ochre)':v==='Low'||v==='Unproven'?'var(--clay)':'var(--ink-3)';
  const watchlist=`
    <div class="dec-sec-head"><div><h3>Global Trend Radar</h3><div class="dsh-sub">Three to watch — what's rising, peaking and fading</div></div><a onclick="go('trends')">Open radar →</a></div>
    <button class="gti-line gti-btn" onclick="openGlobalIntel()"><b>Global intelligence</b><span class="gti-sep">·</span>14 accelerating<span class="gti-sep">·</span>6 relevant to Meridian<span class="gti-sep">·</span>3 nearing saturation<span class="gti-sep">·</span><span style="color:var(--ember-ink);font-weight:700">2 require action</span><span class="gti-inspect">where from? ⌕</span></button>
    <div class="radar-cards">
      ${radar.map(({t,band})=>{const l=lifecycleOf(t);const rec=recommend(t);return `<div class="rcard" onclick="lastHeroForScore=TRENDS.find(x=>x.name==='${esc(t.name)}');openOpp('${esc(t.name)}')">
        <div class="rcard-img">${mtile({color:t.col,fabric:t.fabric,garmentKey:t.g,img:photoFor(t.g,t.mood,t.gd)})}<span class="rcard-band" style="background:${STAGE_COL[l.stage]}">${band}</span></div>
        <div class="rcard-body">
          <div class="rcard-mkt">${t.cat} · ${MKTS[t.name]||'Global'}</div>
          <div class="rcard-name">${t.name}</div>
          <div class="rcard-interp">${INTERP[t.name]||whyFor(t).split('—')[0].trim()}</div>
          <div class="rcard-foot"><span class="rcard-resp" style="color:${rec.col}">● ${rec.action}</span><span class="rcard-go">${rec.action==='Develop'?'Create Brief':'Review'} →</span></div>
        </div>
      </div>`;}).join('')}
    </div>`;

  // ---- 7. OUTCOMES & LEARNINGS — the differentiation proof ----
  const learnings=`
    <div class="dec-sec-head" style="margin-top:4px"><div><h3>Outcomes &amp; learnings</h3><div class="dsh-sub">What happened after past recommendations — how Atelier is adjusting</div></div><a onclick="go('analytics')">All outcomes →</a></div>
    <div class="learn-grid">
      <button class="learn-card win" onclick="go('analytics')">
        <div class="learn-tag" style="background:#EDF3EF;color:var(--sage)">✓ RECOMMENDATION PAID OFF</div>
        <div class="learn-txt">The reorder approved on <b>May 14</b> produced <b>22% more full-price sales</b> than the original plan.</div>
        <div class="learn-meta">Bias slip — ink · forecast hit</div>
      </button>
      <button class="learn-card miss" onclick="go('backtest')">
        <div class="learn-tag" style="background:var(--ochre-wash);color:var(--ochre)">⟳ MODEL ADJUSTED</div>
        <div class="learn-txt">Atelier <b>overestimated</b> demand for the oversized puffer. Confidence for similar outerwear calls has been <b>lowered</b>.</div>
        <div class="learn-meta">Nov 2025 · false positive · learned</div>
      </button>
    </div>`;

  // surfaced: one learning + one commercial exception (the rest stays collapsed)
  const surfaced=`
    <div class="home-surfaced">
      <button class="surf-card surf-learn" onclick="go('analytics')">
        <div class="surf-tag" style="color:var(--sage)">✓ WHAT ATELIER LEARNED</div>
        <div class="surf-txt">The May 14 reorder produced <b>22% more full-price sales</b> than the original plan.</div>
        <div class="surf-meta">Bias slip — ink · forecast hit · <span style="color:var(--cobalt)">see all outcomes →</span></div>
      </button>
      <button class="surf-card surf-risk" onclick="openProduct('Bias slip dress')">
        <div class="surf-tag" style="color:var(--clay)">⚠ MOST URGENT COMMERCIAL RISK</div>
        <div class="surf-txt"><b>Bias slip dress</b> is <b>14 pts below target</b> at week 5, returns concentrated around fit.</div>
        <div class="surf-meta">Review fit before adding a colourway · <span style="color:var(--cobalt)">open product →</span></div>
      </button>
    </div>`;

  // Fixed narrative order regardless of role: global → brand → collection.
  document.getElementById('homeBody').innerHTML=`
    ${header}
    <div class="home-hero-row">
      <div class="dec-hero" style="margin:0">${heroSection}</div>
      ${alsoPanel}
    </div>
    <div class="home-work2">
      ${prioQueue}
      ${numbersCard}
    </div>
    <div class="home-divider"><span>Market intelligence &amp; collection health</span></div>
    <div class="home-radar">${watchlist}</div>
    ${collPulse}
    ${surfaced}
    <details class="home-more">
      <summary class="home-more-sum"><span>All performance &amp; outcomes</span><span class="hm-hint">Every exception, and the full learning history</span><span class="hm-chev">›</span></summary>
      <div class="home-more-body">
        ${performance}
        ${learnings}
      </div>
    </details>`;
}


/* ===== progressive Studio: 3 steps + Creative/Production modes ===== */
let studioState={step:1,mode:'creative',dir:0,dirPicked:false,shown:false};
function goStep(n){studioState.step=n;
  [1,2,3].forEach(i=>{const el=document.getElementById('step-'+i);if(el)el.style.display=i===n?'':'none';});
  document.querySelectorAll('#studioStepper .step').forEach(b=>{const s=+b.dataset.step;b.classList.toggle('on',s===n);b.classList.toggle('done',s<n);});
  if(n===2)applyStudioMode();
  if(n===3&&!studioState.shown)renderDirections();
}
function setStudioMode(m){studioState.mode=m;document.querySelectorAll('#modeSwitch button').forEach(b=>b.classList.toggle('on',b.dataset.mode===m));applyStudioMode();if(studioState.step===3&&studioState.dirPicked)renderDirDetail();toast(m==='creative'?'Concept view — feasibility hidden until you pick a direction':'Development view — early feasibility notes on');}
function applyStudioMode(){const prod=studioState.mode==='production';const pb=document.getElementById('prodBox'),cl=document.getElementById('creativeLock');if(pb)pb.style.display=prod?'':'none';if(cl)cl.style.display=prod?'none':'';if(prod)renderBOM();}
function studioDirData(){
  const img=photoFor(gen.garment,gen.mood,(gen.gender||'Women').toLowerCase());
  const cat=gen.category||'Dress';
  // category-specific construction & grading language — no longer dress-hardcoded
  const byCat={
    Knitwear:{
      a:{cons:['Knit to shape rather than cut-and-sew where the gauge allows.','Rib the hem and cuffs so they recover after wear.','Block the panels before linking to set the gauge.'],sz:[['XS–S','Tighten rib tension at hem and cuff.','Shorten body 2cm.'],['M','True to block; full-needle body.','—'],['L–XL','Add length and a slightly looser body gauge.','Widen armhole 0.5cm.']],fab:gen.fabric+' at a mid gauge holds structure without stiffness; too fine and the body collapses.'},
      b:{cons:['Introduce a transfer-stitch panel for a quiet surface story.','Keep the shoulder seam soft — link, don\u2019t overlock.','Test shrinkage on the actual yarn before grading.'],sz:[['XS–S','Place the stitch panel above the bust.','—'],['M','Centre the panel; standard body.','—'],['L–XL','Scale the panel proportionally, not just longer.','Reinforce the shoulder.']],fab:'A plied yarn gives the panel definition; singles blur it.'},
      c:{cons:['Sleeveless shell in a single clean gauge — the entry-price read.','Self-finish the neckline with a narrow rib.','Minimal seams keep the cost down.'],sz:[['XS–S','Narrow rib neckline.','—'],['M','Standard shell.','—'],['L–XL','Add 1cm body width for drape.','—']],fab:'Lighter weight keeps the price point; confirm opacity.'}
    },
    Tailoring:{
      a:{cons:['Half-canvas front for structure that softens with wear.','Set the sleeve with a slight forward pitch.','Tape the roll line so the lapel holds.'],sz:[['XS–S','Narrow the shoulder 0.5cm.','Shorten sleeve 1.5cm.'],['M','True to block.','—'],['L–XL','Add back width and a deeper armhole.','Let out side seams 1cm.']],fab:gen.fabric+' with enough body to hold a pressed edge; soft cloth needs more canvas.'},
      b:{cons:['Unstructured, unlined — a relaxed soft-tailoring read.','Bind the internal seams for a clean unlined inside.','Patch pockets keep it informal.'],sz:[['XS–S','Soften the shoulder.','—'],['M','Relaxed through the body.','—'],['L–XL','Keep the ease consistent, not just larger.','—']],fab:'A fabric with recovery prevents the unlined body bagging.'},
      c:{cons:['Single-button entry version with simplified construction.','Fused front to hold price.','Fewer internal operations.'],sz:[['XS–S','—','—'],['M','—','—'],['L–XL','Standard grade.','—']],fab:'A stable fused-compatible cloth holds the front at this price.'}
    },
    Trousers:{
      a:{cons:['Set a clean crease with a fused front crease line.','Curtained waistband for a premium inside finish.','Grade the rise carefully across sizes.'],sz:[['XS–S','Shorten rise 1cm; taper the leg.','Hem -3cm.'],['M','True to block.','—'],['L–XL','Add rise and seat room, not just length.','Let out seat 1.5cm.']],fab:gen.fabric+' with a firm hand holds the wide leg; soft cloth collapses the line.'},
      b:{cons:['Pleated, fuller-volume variation with a higher rise.','Anchor the pleats so they sit flat.','Deeper hem for weight.'],sz:[['XS–S','Reduce pleat depth.','—'],['M','Standard pleats.','—'],['L–XL','Scale pleat depth with the body.','—']],fab:'Heavier weight makes the volume hang rather than balloon.'},
      c:{cons:['Flat-front straight-leg entry version.','Simplified waistband.','Fewer operations for price.'],sz:[['XS–S','—','—'],['M','—','—'],['L–XL','Standard grade.','—']],fab:'A mid-weight twill keeps the price and the shape.'}
    },
    Outerwear:{
      a:{cons:['Clean unlined or half-lined body in a structured cloth.','Bind seams or bag-out the facings for a clean inside.','Bartack stress points at pockets and vents.'],sz:[['XS–S','Shorten body and sleeve.','—'],['M','True to block.','—'],['L–XL','Add room over layers, not just length.','Deepen armhole.']],fab:gen.fabric+' needs enough weight to hold the collar and shoulder line.'},
      b:{cons:['Oversized, dropped-shoulder statement volume.','Reinforce the dropped shoulder seam.','Deeper pockets for proportion.'],sz:[['XS–S','Keep the drop proportional, not exaggerated.','—'],['M','Standard oversized.','—'],['L–XL','Scale the volume with the frame.','—']],fab:'A cloth with body prevents the volume reading sloppy.'},
      c:{cons:['Lighter unlined entry layer.','Simplified collar.','Fewer panels.'],sz:[['XS–S','—','—'],['M','—','—'],['L–XL','Standard grade.','—']],fab:'A lighter shell holds the price; confirm wind resistance.'}
    },
    default:{
      a:{cons:['Build the cleanest, most commercial read in your core codes.','Finish seams to the brand standard.','Confirm proportion against the block.'],sz:[['XS–S','Refine proportion for the smaller frame.','—'],['M','True to block.','—'],['L–XL','Grade for room, not just length.','Confirm shaping.']],fab:gen.fabric+' suits the silhouette at a mid weight; confirm hand and drape.'},
      b:{cons:['A collection-statement variation with more design content.','Hold the brand restraint while adding one strong move.','Test the detail in calico first.'],sz:[['XS–S','Scale the detail down.','—'],['M','Standard.','—'],['L–XL','Scale the detail proportionally.','—']],fab:'Choose a cloth that carries the added detail cleanly.'},
      c:{cons:['A simplified entry-price version.','Reduce operations to hold the price.','Keep one signature detail only.'],sz:[['XS–S','—','—'],['M','—','—'],['L–XL','Standard grade.','—']],fab:'A lighter or simpler cloth protects the entry price.'}
    }
  };
  const set=byCat[cat]||byCat.default;
  return [
   {dn:'Direction A',dt:'Commercial core',dd:`The restrained, most commercial read of this brief in your core codes — the quiet ${cat.toLowerCase()} that reads expensive.`,
    sizes:set.a.sz,constr:set.a.cons,fabricNote:set.a.fab},
   {dn:'Direction B',dt:'Collection statement',dd:'More design content and a stronger point of view — the piece that anchors the story, same underlying demand.',
    sizes:set.b.sz,constr:set.b.cons,fabricNote:set.b.fab},
   {dn:'Direction C',dt:'Entry-price test',dd:'A simplified version built to a lower price, to test the demand before committing depth.',
    sizes:set.c.sz,constr:set.c.cons,fabricNote:set.c.fab}
  ].map(d=>({...d,img}));
}
function renderDirections(){studioState.shown=true;const dirs=studioDirData();
  document.getElementById('dirGrid').innerHTML=dirs.map((x,i)=>`<button class="dir ${i===studioState.dir&&studioState.dirPicked?'sel':''}" onclick="pickDirection(${i})"><div class="di">${mtile({color:gen.colors[0]||'#1B1A14',fabric:gen.fabric,garmentKey:gen.garment,img:x.img})}</div><div class="db"><div class="dn">${x.dn}</div><div class="dt">${x.dt}</div><div class="dd">${x.dd}</div><div class="dpick">${i===studioState.dir&&studioState.dirPicked?'● Selected — build below':'Select this direction'}</div></div></button>`).join('');
  if(!studioState.dirPicked)document.getElementById('dirDetail').innerHTML='<div class="creative-lock" style="margin:0 0 16px"><span class="lk">✦</span><span>Pick a direction and Atelier opens the size-by-size build, fabric and colour — with early feasibility flagged, not costed.</span></div>';
}
function pickDirection(i){studioState.dir=i;studioState.dirPicked=true;renderDirections();renderDirDetail();}
function renderDirDetail(){
  const d=studioDirData()[studioState.dir];const f=feasibility(gen.category,gen.fabric,gen.colors.length||1);
  // Similar past products from WINNERS + COLL data
  const catMatches=WINNERS.filter(w=>w.g===gen.garment||w.f===gen.fabric).slice(0,3);
  const fallbackMatches=[WINNERS[0],WINNERS[1]].filter(Boolean);
  const similar=catMatches.length?catMatches:fallbackMatches;
  // Size curve recommendation based on category
  const sizeCurves={Dress:{XS:8,S:22,M:34,L:26,XL:10},Knitwear:{XS:6,S:20,M:36,L:28,XL:10},Tailoring:{XS:5,S:18,M:34,L:30,XL:13},Outerwear:{XS:7,S:21,M:35,L:27,XL:10},Trousers:{XS:6,S:20,M:33,L:30,XL:11},default:{XS:8,S:22,M:34,L:26,XL:10}};
  const curve=sizeCurves[gen.category]||sizeCurves.default;
  // DNA guardrail check
  const guardrailChecks=[
    {ok:['Minimal','Architectural','Tonal','On-brand','Elevated'].includes(gen.mood),label:'Aesthetic mood',pass:['Minimal','Architectural','Tonal','On-brand','Elevated'],fail:'Romantic — review against core codes'},
    {ok:f.pass,label:'Production feasibility',pass:f.note,fail:'Limited fabric or heavy construction — confirm capacity'},
    {ok:['Dress','Knitwear','Tailoring','Outerwear','Trousers','Skirt'].includes(gen.category),label:'Category guardrail',pass:'Within core category mix',fail:'Outside established categories — test carefully'},
    {ok:gen.fit!=='Oversized'||gen.category!=='Tailoring',label:'Fit x category',pass:'Fit and category are compatible',fail:'Oversized tailoring conflicts with architectural codes'},
  ];
  // Commercial viability narrative
  const stAnalogue=similar.length?parseInt(similar[0].v)+'–'+parseInt(similar[similar.length-1].v)+'%':'65–78%';
  const confidence=f.pass&&guardrailChecks.every(g=>g.ok)?'High':'Medium';
  const confReason=!f.pass?'fabric or construction adds risk':!guardrailChecks[0].ok?'mood drifts from core codes':'new silhouette for this season';

  document.getElementById('dirDetail').innerHTML=`
   <div class="stepwrap" style="margin-bottom:16px"><div class="sgrid">
    <div>
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px"><div style="font-family:var(--disp);font-weight:700;font-size:15px">Size & fit considerations</div><span class="mono" style="font-size:10px;color:var(--ink-3)">${d.dt}</span></div>
      <p style="font-size:12px;color:var(--ink-2);margin:0 0 8px">How the fit shifts across the run — directional, confirm against the brand's block before specifying.</p>
      <table class="size-tbl">${d.sizes.map(s=>`<tr><td class="sz">${s[0]}</td><td><b>${s[1]}</b>${s[2]&&s[2]!=='—'?`<br><span class="grade">Consider · ${s[2]}</span>`:''}</td></tr>`).join('')}</table>
      <div style="font-family:var(--disp);font-weight:700;font-size:15px;margin:16px 0 6px">Construction notes <span class="mono" style="font-size:9px;color:var(--ink-3);font-weight:400">· indicative</span></div>
      <ul class="constr-list">${d.constr.map(c=>`<li>${c}</li>`).join('')}</ul>

      <div style="font-family:var(--disp);font-weight:700;font-size:15px;margin:18px 0 10px">Recommended size curve</div>
      <p style="font-size:11.5px;color:var(--ink-2);margin:0 0 10px">Based on sell-through history in similar ${gen.category.toLowerCase()} styles at Meridian.</p>
      <div style="display:flex;gap:6px;align-items:flex-end;margin-bottom:4px">
        ${Object.entries(curve).map(([sz,pct])=>`<div style="flex:1;text-align:center">
          <div style="background:var(--cobalt);border-radius:4px 4px 0 0;margin-bottom:4px" style2="height:${pct*1.8}px"></div>
          <div style="height:${pct*1.8}px;background:var(--cobalt);border-radius:4px 4px 0 0;margin-bottom:4px"></div>
          <div class="mono" style="font-size:9px;font-weight:700;color:var(--cobalt)">${pct}%</div>
          <div class="mono" style="font-size:8px;color:var(--ink-3)">${sz}</div>
        </div>`).join('')}
      </div>
      <div style="font-size:11px;color:var(--ink-3);margin-top:4px">💡 Start with this depth distribution — adjust after the first 30 days of sell-through data.</div>

      <div style="font-family:var(--disp);font-weight:700;font-size:15px;margin:18px 0 10px">Brand DNA check</div>
      ${guardrailChecks.map(g=>`<div style="display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-top:1px solid var(--hair)">
        <span style="width:18px;height:18px;border-radius:50%;background:${g.ok?'var(--sage)':'var(--ochre)'};color:#fff;display:grid;place-items:center;font-size:10px;font-weight:700;flex:none;margin-top:1px">${g.ok?'✓':'!'}</span>
        <div><div style="font-weight:600;font-size:12.5px">${g.label}</div><div style="font-size:11.5px;color:var(--ink-2);margin-top:2px">${g.ok?(typeof g.pass==='string'?g.pass:'Pass'):g.fail}</div></div>
      </div>`).join('')}
    </div>
    <div>
      <div style="font-family:var(--disp);font-weight:700;font-size:15px;margin-bottom:6px">Fabric</div>
      <p style="font-size:12px;color:var(--ink-2);margin:0 0 10px">${d.fabricNote}</p>
      <div class="swrow"><span class="nm">${gen.fabric}</span><span class="bar2"><i style="width:84%"></i></span><span class="pct">84%</span></div>
      <div class="swrow"><span class="nm">Alt · more drape</span><span class="bar2"><i style="width:58%"></i></span><span class="pct">58%</span></div>

      <div style="font-family:var(--disp);font-weight:700;font-size:15px;margin:18px 0 8px">Colour</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:4px">${(gen.colors.length?gen.colors:['#1B1A14']).map(c=>`<span style="width:30px;height:30px;border-radius:8px;background:${c};border:1px solid rgba(0,0,0,.12)"></span>`).join('')}</div>

      <div style="font-family:var(--disp);font-weight:700;font-size:15px;margin:18px 0 8px">Similar past products</div>
      <p style="font-size:11.5px;color:var(--ink-2);margin:0 0 10px">Styles with similar attributes that Meridian has sold before.</p>
      ${similar.map(w=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--hair)">
        <div style="width:32px;height:40px;border-radius:6px;overflow:hidden;flex:none">${mtile({color:w.c,fabric:w.f,garmentKey:w.g,img:photoFor(w.g,'Minimal','women')})}</div>
        <div style="flex:1"><div style="font-weight:600;font-size:12.5px">${w.n}</div><div style="font-family:var(--d);font-size:9px;color:var(--ink-3)">${w.sku}</div></div>
        <div style="font-family:var(--d);font-size:12px;font-weight:700;color:var(--sage)">${w.v}</div>
      </div>`).join('')}

      <div style="font-family:var(--disp);font-weight:700;font-size:15px;margin:18px 0 8px">Collection role</div>
      <div style="background:var(--paper);border-radius:10px;padding:13px 14px;font-size:12.5px;line-height:1.55;color:var(--ink-2)">
        <div style="display:grid;grid-template-columns:auto 1fr;gap:6px 10px">
          <span style="color:var(--ink-3);font-family:var(--d);font-size:9px;text-transform:uppercase;letter-spacing:.06em;margin-top:2px">Gap filled</span><span style="font-weight:600;color:var(--ink)">${gen.category} · ${gen.mood.toLowerCase()} · entry price</span>
          <span style="color:var(--ink-3);font-family:var(--d);font-size:9px;text-transform:uppercase;letter-spacing:.06em;margin-top:2px">Works with</span><span>8 existing AW26 looks</span>
          <span style="color:var(--ink-3);font-family:var(--d);font-size:9px;text-transform:uppercase;letter-spacing:.06em;margin-top:2px">Duplication risk</span><span style="color:var(--sage);font-weight:600">Low — no near-duplicate in current line</span>
        </div>
      </div>

      <div style="font-family:var(--disp);font-weight:700;font-size:15px;margin:18px 0 8px">Commercial viability</div>
      <div style="background:${confidence==='High'?'#EDF3EF':'var(--ochre-wash)'};border:1px solid ${confidence==='High'?'#c8e0cc':'var(--ochre)'};border-radius:10px;padding:13px 14px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="font-family:var(--d);font-size:9px;font-weight:700;letter-spacing:.08em;padding:2px 8px;border-radius:4px;background:${confidence==='High'?'var(--sage)':'var(--ochre)'};color:#fff">${confidence.toUpperCase()} CONFIDENCE</span>
        </div>
        <p style="font-size:12.5px;color:var(--ink);margin:0;line-height:1.55">High similarity with ${similar.map(w=>w.n).join(' and ')}, which had ${stAnalogue} sell-through${confidence==='Medium'?' — '+confReason:''}. ${f.pass?'Construction is within your supplier range.':'Production needs an early capacity check.'}</p>
      </div>

      <div style="font-family:var(--disp);font-weight:700;font-size:15px;margin:18px 0 8px">Production feasibility</div>
      <div class="bom ${f.pass?'pass':'fail'}" style="margin-top:0">
        <div class="row"><span class="lk">Construction</span><span class="vv">${f.complexity} complexity</span></div>
        <div class="row"><span class="lk">Fabric availability</span><span class="vv">${f.fabricAvail}</span></div>
        <div class="row tot"><span class="lk" style="font-weight:600;color:var(--ink)">Readiness</span><span class="vv" style="color:${f.ready.col};font-weight:700">${f.ready.lbl}</span></div>
        <div class="flag" style="color:var(--ink-3);font-size:10px">Early feasibility signal — not costing. Margin needs supplier &amp; freight data from your systems.</div>
      </div>
    </div>
   </div></div>`;
}
function studioRegen(){studioState.shown=false;studioState.dirPicked=false;renderDirections();toast('Generated 3 fresh directions from your codes');}
/* opportunity linking in Step 1 */
function renderOppLink(){
  const top=[...TRENDS].filter(t=>t.brand).sort((a,b)=>b.score-a.score).slice(0,4);
  const el=document.getElementById('oppLink');if(!el)return;
  el.innerHTML=`<div class="opts">${top.map(t=>`<button class="opt ${gen._opp===t.name?'on':''}" onclick="linkOpp('${t.name.replace(/'/g,"\\'")}')">${t.name}</button>`).join('')}</div>`;
}
function linkOpp(name){const t=TRENDS.find(x=>x.name===name);if(!t)return;gen._opp=name;gen.category=t.cat==='Denim'?'Trousers':t.cat;gen.garment=t.g;gen.fabric=(FAB_TEX[t.fabric]?t.fabric:'Organic cotton');gen.mood=['On-brand','Romantic','Editorial','Minimal','Elevated'].includes(t.mood)?t.mood:'On-brand';const di=document.getElementById('dirInput');if(di)di.value=whyShort(t);syncGenUI();renderOppLink();toast('Brief locked to: '+name);}
function whyShort(t){return ({Dress:'midi length, fluid drape, adjustable straps',Knitwear:'fine-gauge, tonal, soft hand',Tailoring:'clean high-waist line, soft structure',Outerwear:'soft unlined structure, utility detail',Denim:'washed indigo, barrel leg',Skirt:'midi length, soft movement',Tee:'elevated weight, clean neckline'})[t.cat]||'clean, on-brand silhouette';}
function renderRefChips(){const el=document.getElementById('refChips');if(!el)return;const imgs=[IMG.slip,IMG.sunlit,IMG.knit];el.innerHTML=imgs.map(u=>`<div class="refchip"><img src="${u}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentNode.style.background='var(--paper-2)';this.remove()"></div>`).join('')+`<div class="refchip add" onclick="toast('Drop a reference image, paste a URL, or pick from a board')">+</div>`;}
function studioFromOpp(name){go('studio');setStudioPane('gen');const t=TRENDS.find(x=>x.name===name);if(t)linkOpp(name);goStep(1);toast('Brief loaded into Studio');}
window.goStep=goStep;window.setStudioMode=setStudioMode;window.pickDirection=pickDirection;window.studioRegen=studioRegen;window.linkOpp=linkOpp;window.studioFromOpp=studioFromOpp;window.openOpp=openOpp;


document.getElementById('askAi').addEventListener('click',()=>openAssistant());
document.getElementById('bell').addEventListener('click',()=>go('alerts'));
document.getElementById('profileBtn').addEventListener('click',()=>document.getElementById('rolepop').classList.toggle('on'));
document.querySelectorAll('#rolepop button').forEach(b=>b.addEventListener('click',()=>setRole(b.dataset.role)));
document.addEventListener('click',e=>{if(!e.target.closest('#profileBtn')&&!e.target.closest('#rolepop'))document.getElementById('rolepop').classList.remove('on');});
document.getElementById('watchtabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;cmpGroup=b.dataset.w;cmpBrand=null;renderCompetitors();});
document.getElementById('markRead').addEventListener('click',()=>{document.querySelector('#bell .dot').style.display='none';const c=document.querySelector('[data-view="alerts"] .count');if(c)c.remove();toast('All alerts marked read');});
document.getElementById('wmapMode').addEventListener('click',e=>{const b=e.target.closest('button');if(b)wsSetMode(b.dataset.m);});
document.getElementById('dnaTabs').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;activeDnaTab=b.dataset.dt;renderBrandEngine();});

/* ===== init ===== */
renderHome();renderColl();renderSwatches();renderBOM();renderIntg();renderFuture();renderOppLink();renderRefChips();applyStudioMode();renderBrandEngine();



/* ============================================================
   ATELIER v8 — decision-platform rebuild (additive override)
   Reuses globals: IMG, COLORS, mtile, photoFor, shade, openDrawer,
   closeDrawer, toast, go, RENDERERS, TITLES.
   ============================================================ */
(function(){
"use strict";
const $=(id)=>document.getElementById(id);
const TONE={sage:'var(--sage)',ochre:'var(--ochre)',clay:'var(--clay)',ember:'var(--ember)',cobalt:'var(--cobalt)'};

function v8Donut(segs,centerN,centerT){
  const C=2*Math.PI*52; let off=0;
  const rings=segs.map(s=>{const len=s.frac*C;const r=`<circle cx="64" cy="64" r="52" fill="none" stroke="${s.color}" stroke-width="18" stroke-dasharray="${len} ${C-len}" stroke-dashoffset="${-off}" transform="rotate(-90 64 64)"/>`;off+=len;return r;}).join('');
  return `<div class="v8donut-wrap"><svg viewBox="0 0 128 128" width="128" height="128">${rings}</svg><div class="v8donut-center"><div class="n">${centerN}</div><div class="t">${centerT}</div></div></div>`;
}
function v8metric(k,word,pct,tone){
  return `<div class="v8m"><div class="v8m-top"><span class="v8m-k">${k}</span><span class="v8m-r">${word?`<span class="v8m-w" style="color:${TONE[tone]}">${word}</span>`:''}<span class="v8m-pct">${pct}%</span></span></div><span class="v8m-bar"><i style="width:${pct}%;background:${TONE[tone]}"></i></span></div>`;
}
function v8knitSVG(fill){return `<svg viewBox="0 0 200 260"><g fill="${fill||'#D8D2C4'}" stroke="#16150F" stroke-opacity=".16" stroke-width="1.3"><path d="M58 60 L36 76 L30 150 L50 156 L64 96 Z"/><path d="M142 60 L164 76 L170 150 L150 156 L136 96 Z"/><path d="M58 60 L84 50 Q100 58 116 50 L142 60 L140 224 L60 224 Z"/><path d="M84 50 Q100 64 116 50 L112 44 Q100 54 88 44 Z"/></g></svg>`;}
const CAT_COL={Knitwear:'#9A8E74',Tailoring:'#4A4944',Dresses:'#B07A5B',Outerwear:'#6E6A5C',Tops:'#C7B89C',Denim:'#3C4C68',Others:'#CDBFA6'};

/* ============================================================
   SECTION 1 · COLLECTION CREATOR — multi-scenario
   ============================================================ */
const SW={bone:'#E7E1D3',oat:'#CDBFA6',clay:'#B07A5B',sage:'#8B9079',char:'#4A4944',ink:'#1B1A14',indigo:'#3C4C68',rust:'#9C4A2E'};
const SCENS=[
  {id:'A',name:'Commercial Confidence',tag:'Best for margin',tagTone:'sage',
   metrics:[['Revenue potential','High',72,'sage'],['Gross margin','61%',61,'sage'],['Newness','22%',22,'ink-3'],['Development risk','Low',20,'sage']],
   styles:34,cats:6,drops:3,thumbs:['knit','tailor','knit','slip','tailor'],sw:['bone','oat','clay','sage','char','ink'],
   rationale:'Leans on proven silhouettes and core categories. Lowest development risk and the strongest margin, with deliberately limited newness.',
   assume:['Europe & UK markets','3 drops: Aug / Sept / Oct','Target avg. sell-through: 82%','Stock cover: 4.6 weeks','Markdown risk: Low'],
   mix:[['Knitwear',32,11],['Tailoring',24,8],['Dresses',15,5],['Tops',15,5],['Outerwear',8,3],['Others',6,2]],
   perf:[['€1.31M','Revenue'],['61%','Gross margin'],['2.4x','GMROI'],['82%','Sell-through']]},
  {id:'B',name:'Balanced Growth',tag:'Recommended',tagTone:'cobalt',rec:true,
   metrics:[['Revenue potential','High',80,'sage'],['Gross margin','58%',58,'sage'],['Newness','38%',38,'ochre'],['Development risk','Medium',50,'ochre']],
   styles:38,cats:7,drops:3,thumbs:['knit','slip','tailor','sheer','knit'],sw:['bone','oat','sage','char','indigo','ink'],
   rationale:'Balanced approach with a strong commercial core and directional highlights in key categories — introducing relevant newness in elevated knits and soft tailoring.',
   assume:['Europe & UK markets','3 drops: Aug / Sept / Oct','Target avg. sell-through: 78%','Stock cover: 5.2 weeks','Markdown risk: Medium'],
   mix:[['Knitwear',28,11],['Dresses',20,8],['Tops',18,7],['Tailoring',16,6],['Outerwear',10,4],['Others',8,2]],
   perf:[['€1.42M','Revenue'],['58%','Gross margin'],['2.1x','GMROI'],['78%','Sell-through']]},
  {id:'C',name:'Brand Expansion',tag:'Most directional',tagTone:'ember',
   metrics:[['Revenue potential','Medium–High',64,'cobalt'],['Gross margin','53%',53,'ochre'],['Newness','61%',61,'cobalt'],['Development risk','High',78,'clay']],
   styles:36,cats:7,drops:3,thumbs:['sheer','slip','sunlit','knit','corset'],sw:['bone','clay','rust','indigo','char','ink'],
   rationale:'Pushes the brand language with greater novelty and a new occasion opportunity. Lower historic evidence — recommend a test-batch production strategy.',
   assume:['Europe & UK markets','3 drops: Aug / Sept / Oct','Target avg. sell-through: 71%','Stock cover: 6.1 weeks','Markdown risk: Medium–High'],
   mix:[['Knitwear',24,9],['Dresses',22,8],['Tops',16,6],['Tailoring',14,5],['Outerwear',12,4],['Others',12,4]],
   perf:[['€1.55M','Revenue'],['53%','Gross margin'],['1.8x','GMROI'],['71%','Sell-through']]}
];
const OPPS=[['Sheer & Layering','High','+142%','sage'],['Soft Tailoring','High','+78%','sage'],['Textured Knits','Medium','+36%','ochre'],['Utility Refinement','Medium','+29%','ochre']];
const v8cc={sel:'B',insTab:'Overview'};

function renderCollectionCreator(){
  const host=$('view-collcreate'); if(!host) return;
  const ins=SCENS.find(s=>s.id===v8cc.sel)||SCENS[1];
  host.innerHTML=`
  <div class="v8wrap">
    <div class="v8oh">
      <div>
        <div class="v8crumb">Collection Creator <span class="sep">›</span> <b>AW26 Main Collection</b> <span class="v8pill draft">Draft</span></div>
        <div class="v8oh-title"><h1>Collection scenarios</h1></div>
      </div>
      <div class="v8oh-right">
        <span class="v8saved">Last saved 2m ago</span>
        <div class="v8avs"><span class="v8av">EL</span><span class="v8av">MR</span><span class="v8av" style="background:var(--ink);color:#fff">+3</span></div>
        <button class="btn ghost" onclick="toast('Share link copied')"><svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none"><path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13"/></svg>Share</button>
        <button class="btn" onclick="v8ccGenerate()">✦ Generate scenarios</button>
      </div>
    </div>
    <div class="v8tabs">${['Brief','Scenarios','Range Plan','Outfits','Color Story','Price & Margin','Calendar','Summary'].map((t,i)=>`<button class="v8tab ${i===1?'on':''}" onclick="${i===1?'':"toast('"+t+" — collection workspace')"}">${t}</button>`).join('')}</div>

    <div class="v8cc-grid">
      <div>
        <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px">
          <div><div class="v8ph" style="font-size:15px">Collection scenarios</div><p class="v8psub" style="margin:2px 0 0">Three differentiated strategies from your brief and brand DNA — not one answer.</p></div>
        </div>
        <div class="v8sc-cards">${SCENS.map(s=>`
          <button class="v8sc ${s.id===v8cc.sel?'sel':''}" onclick="v8cc.sel='${s.id}';renderCollectionCreator()">
            <div class="v8sc-h"><div class="nm"><small>Scenario ${s.id}</small>${s.name}</div><span class="v8sc-tag" style="background:${s.tagTone==='cobalt'?'var(--cobalt-wash)':s.tagTone==='ember'?'var(--ember-wash)':'#E7F0E9'};color:${s.tagTone==='cobalt'?'var(--cobalt-ink)':s.tagTone==='ember'?'var(--ember-ink)':'var(--sage)'}">${s.tag}</span></div>
            <div style="display:flex;flex-direction:column;gap:6px">${s.metrics.map(([k,v,pct,tone])=>`<div class="v8scm"><span class="k">${k}</span><span class="bar"><i style="width:${pct}%;background:${TONE[tone]||'var(--ink-3)'}"></i></span><span class="v">${v}</span></div>`).join('')}</div>
            <div class="v8sc-thumbs">${s.thumbs.map(g=>`<div class="t">${mtile({color:'#9A968B',fabric:'',garmentKey:g==='knit'?'knit':g==='tailor'?'blazer':g==='slip'||g==='sunlit'?'dress':'dress',img:IMG[g]||photoFor('knit','Minimal','women')})}</div>`).join('')}</div>
            <div class="v8sc-meta">${s.styles} styles · ${s.cats} categories · ${s.drops} drops</div>
            <div class="v8sc-sw">${s.sw.map(c=>`<span style="background:${SW[c]}"></span>`).join('')}</div>
            <div class="v8sc-btns"><button class="btn ${s.id===v8cc.sel?'':'ghost'}" onclick="event.stopPropagation();v8cc.sel='${s.id}';renderCollectionCreator()">View scenario</button><button class="btn ghost" onclick="event.stopPropagation();toast('Scenario ${s.id} set as the base to edit')">Use as base</button></div>
          </button>`).join('')}</div>

        <div class="v8opps">
          <div class="v8opps-h"><div class="v8block-h" style="margin:0">Top opportunities included</div><span class="link" onclick="go('whitespace')">View all opportunities ›</span></div>
          <div class="v8opps-grid">${OPPS.map(([nm,lv,gr,tone])=>`<div class="v8opp"><div class="nm"><span class="dot" style="background:${TONE[tone]}"></span>${nm}</div><div class="mt"><span>${lv} opportunity</span><span class="gr">Growing ${gr}</span></div></div>`).join('')}</div>
        </div>
      </div>

      <!-- INSPECTOR -->
      <div class="v8panel">
        <h2 class="v8insp-title">Scenario ${ins.id} — ${ins.name}</h2>
        <div class="v8subtabs">${['Overview','Categories','Price Architecture','Assortment'].map(t=>`<button class="v8subtab ${v8cc.insTab===t?'on':''}" onclick="v8cc.insTab='${t}';renderCollectionCreator()">${t}</button>`).join('')}</div>
        ${v8ccInspector(ins)}
        <div class="v8insp-foot">
          <div class="row"><button class="btn ghost" onclick="toast('Scenario actions')">Actions</button><button class="btn ghost" onclick="v8ccCompare()">Compare scenarios</button></div>
          <button class="btn" onclick="toast('Opening range plan for Scenario ${ins.id}')">Proceed to range plan →</button>
        </div>
      </div>
    </div>
  </div>`;
}
function v8ccInspector(s){
  if(v8cc.insTab==='Categories'){
    return `<div class="v8block-h" style="margin-top:0">Category mix · ${s.styles} styles</div>
      ${s.mix.map(([nm,pc,ct])=>`<div style="display:grid;grid-template-columns:84px 1fr 44px;gap:9px;align-items:center;padding:7px 0;border-top:1px solid var(--hair)"><span style="font-size:12px;font-weight:600">${nm}</span><span style="height:6px;background:var(--paper-2);border-radius:4px;overflow:hidden"><i style="display:block;height:100%;width:${pc}%;background:${CAT_COL[nm]||'#CDBFA6'}"></i></span><span style="font-family:var(--d);font-size:10.5px;font-weight:700;text-align:right">${pc}% · ${ct}</span></div>`).join('')}`;
  }
  if(v8cc.insTab==='Price Architecture'){
    const tiers=[['Entry','€80–€150',Math.round(s.styles*0.22)],['Core','€150–€320',Math.round(s.styles*0.42)],['Premium','€320–€520',Math.round(s.styles*0.26)],['Hero','€520+',Math.round(s.styles*0.10)]];
    return `<div class="v8block-h" style="margin-top:0">Price tiers · computed from range</div>
      ${tiers.map(([t,r,n])=>`<div style="display:grid;grid-template-columns:74px 96px 1fr 26px;gap:8px;align-items:center;padding:8px 0;border-top:1px solid var(--hair)"><span style="font-weight:700;font-size:12.5px">${t}</span><span style="font-family:var(--d);font-size:10.5px;color:var(--ink-2)">${r}</span><span style="height:6px;background:var(--paper-2);border-radius:4px;overflow:hidden"><i style="display:block;height:100%;width:${Math.round(n/s.styles*100)}%;background:var(--cobalt)"></i></span><span style="font-family:var(--d);font-size:11px;font-weight:700">${n}</span></div>`).join('')}`;
  }
  if(v8cc.insTab==='Assortment'){
    return `<div class="v8block-h" style="margin-top:0">Assortment balance</div>
      ${[['Core vs directional','60 / 40 split'],['Carryover','9 styles preserved'],['Colour concentration','Within threshold'],['Cannibalisation risk','Low — 1 near-overlap'],['SKU count','~'+(s.styles*2.4|0)+' SKUs at 2.4 cw/style']].map(([k,v])=>`<div class="v8brow"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}`;
  }
  // Overview
  return `<div class="v8block-h" style="margin-top:0">Scenario rationale</div>
    <p class="v8note" style="font-size:12px;color:var(--ink-2);line-height:1.55;margin:0">${s.rationale}</p>
    <div class="v8block-h">Key assumptions</div>
    <div class="v8assume">${s.assume.map(a=>`<div><span class="d">·</span>${a}</div>`).join('')}</div>
    <div class="v8block-h">Category mix</div>
    <div style="display:flex;gap:16px;align-items:center">
      ${v8Donut(s.mix.map(m=>({frac:m[1]/100,color:CAT_COL[m[0]]||'#CDBFA6'})),s.styles,'styles')}
      <div class="v8leg">${s.mix.map(m=>`<div class="v8leg-row"><span class="v8leg-dot" style="background:${CAT_COL[m[0]]||'#CDBFA6'}"></span><span class="nm">${m[0]}</span><span class="pc">${m[1]}%</span><span class="ct">(${m[2]})</span></div>`).join('')}</div>
    </div>
    <div class="v8block-h">Expected performance <span style="text-transform:none;letter-spacing:0;color:var(--ink-3);font-weight:400">· model estimate</span></div>
    <div class="v8perf">${s.perf.map(([v,l])=>`<div class="t"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}</div>`;
}
window.v8ccCompare=function(){
  openDrawer(`<div class="dr-card" style="margin-top:8px"><div class="ey" style="color:var(--cobalt)">Scenario comparison</div><h2 style="font-size:20px;margin-bottom:12px">Three strategies, side by side</h2>
    <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Dimension</th>${SCENS.map(s=>`<th style="text-align:right">${s.name}</th>`).join('')}</tr></thead><tbody>
    ${[['Revenue','perf0'],['Gross margin','perf1'],['GMROI','perf2'],['Sell-through','perf3'],['Styles','styles'],['Newness','new'],['Development risk','risk']].map(([lbl,key])=>`<tr><td style="font-weight:600">${lbl}</td>${SCENS.map(s=>{let v='';if(key.startsWith('perf'))v=s.perf[+key.slice(4)][0];else if(key==='styles')v=s.styles;else if(key==='new')v=s.metrics[2][1];else if(key==='risk')v=s.metrics[3][1];return `<td style="text-align:right;font-family:var(--d);font-size:12px">${v}</td>`;}).join('')}</tr>`).join('')}
    </tbody></table></div>
    <p style="font-size:11px;color:var(--ink-3);margin-top:12px">Each figure is a model estimate on the stated assumptions — not a committed forecast.</p>
    <button class="btn ghost" style="margin-top:12px;width:100%" onclick="closeDrawer()">Close</button></div>`);
};
window.v8ccGenerate=function(){toast('Re-generated 3 scenarios from the current brief and live brand DNA');renderCollectionCreator();};
window.renderCollectionCreator=renderCollectionCreator;

/* ============================================================
   SECTION 2 · DESIGN STUDIO — style cockpit
   ============================================================ */
const v8ds={stage:'refine',refineTab:'Silhouette',variant:0,
  controls:{length:'Hip',ease:55,neckline:'Crew',sleeve:'Long',transparency:60,rib:30,notes:'Consider pointelle variation for the August drop if lead time allows.'}};
const DS_VARIANTS=['knit','tailor','sheer','sunlit','slip','corset','wrap','knit'];

function renderStudioV8(){
  const host=$('view-studio'); if(!host) return;
  host.innerHTML=`
  <div class="v8wrap">
    <div class="v8oh">
      <div>
        <div class="v8crumb">Design Studio <span class="sep">›</span> AW26 Main <span class="sep">›</span> <b>KN-014 Sheer Rib Knit Top</b> <span class="v8pill dir">Directional</span></div>
      </div>
      <div class="v8oh-right">
        <div class="v8mini" style="gap:4px;padding:5px 7px"><button onclick="toast('Previous version')" style="color:var(--ink-3)">‹</button><span style="font-weight:700">v2</span><button onclick="toast('Next version')" style="color:var(--ink-3)">›</button></div>
        <button class="v8mini" onclick="toast('Snapshot saved')"><svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" fill="none"><rect x="3" y="7" width="18" height="13" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 7l1.5-2h5L16 7"/></svg></button>
        <button class="btn ghost" onclick="toast('Shared with the team')">Share</button>
        <button class="btn" onclick="toast('Saved')">Save</button>
      </div>
    </div>
    <div class="v8step">${[['brief','Brief'],['directions','Directions'],['refine','Refine'],['validate','Validate'],['handoff','Handoff']].map(([k,l],i)=>`${i?'<span class="v8st-sep">·</span>':''}<button class="v8st ${v8ds.stage===k?'on':''} ${v8dsIdx(k)<v8dsIdx(v8ds.stage)?'done':''}" onclick="v8ds.stage='${k}';renderStudioV8()"><span class="n">${v8dsIdx(k)<v8dsIdx(v8ds.stage)?'✓':i+1}</span>${l}</button>`).join('')}</div>
    ${v8dsStage()}
  </div>`;
}
function v8dsIdx(k){return ['brief','directions','refine','validate','handoff'].indexOf(k);}

function v8dsBriefCard(){
  return `<div class="v8panel">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><div class="v8ph" style="margin:0">Design brief</div><span class="v8brief-edit" onclick="toast('Editing brief')">Edit brief</span></div>
    ${[['Collection role','Directional'],['Category','Knitwear'],['Occasion','Work, Evening'],['Target customer','Core + Adjacent'],['Target retail','€160'],['Target cost','€60'],['Target margin','62%'],['Drop','August']].map(([k,v])=>`<div class="v8brow"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}
    <div class="v8why"><div class="h">Why it exists</div><p>Addresses the rising sheer-layering trend with a refined, versatile silhouette. Fills a gap in the occasion-knitwear story and reuses a proven fitted block.</p></div>
  </div>`;
}
function v8dsStage(){
  if(v8ds.stage==='refine') return v8dsRefine();
  if(v8ds.stage==='brief') return `<div class="v8ds-grid" style="grid-template-columns:1fr"><div style="max-width:560px">${v8dsBriefCard()}<div class="v8detail-foot" style="display:flex;gap:8px;margin-top:14px"><button class="btn" onclick="v8ds.stage='directions';renderStudioV8()">Generate directions →</button></div></div></div>`;
  if(v8ds.stage==='directions'){
    const dirs=[['A','Proven Core Evolution','Proven silhouette, subtle update. Strongest brand alignment, lowest demand and return risk.','knit','High',88],['B','Market-Led Adjacency','Responds directly to the sheer-layering signal. Moderate novelty, stronger acquisition pull.','sheer','High',82],['C','Creative Proposition','Pushes the brand language; weak historic analogue but high differentiation. Test-batch.','sunlit','Medium',66]];
    return `<div class="v8ds-grid" style="grid-template-columns:1fr 1fr 1fr">${dirs.map(([t,nm,bl,im,pot,conf])=>`<div class="v8panel"><div class="v8ds-fig" style="aspect-ratio:4/5;margin-bottom:11px;border-radius:10px"><img src="${IMG[im]}" referrerpolicy="no-referrer" onerror="this.style.display='none'"></div><div style="font-family:var(--d);font-size:9px;color:var(--ink-3);letter-spacing:.06em">DIRECTION ${t}</div><div class="v8ph" style="margin:2px 0 6px">${nm}</div><p style="font-size:11.5px;color:var(--ink-2);line-height:1.45;margin:0 0 10px">${bl}</p><div style="display:flex;gap:16px;margin-bottom:12px"><div><div style="font-family:var(--d);font-size:8px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)">Commercial</div><div style="font-size:12px;font-weight:700;color:${pot==='High'?'var(--sage)':'var(--ochre)'}">${pot}</div></div><div><div style="font-family:var(--d);font-size:8px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)">Confidence</div><div style="font-size:12px;font-weight:700">${conf}%</div></div></div><button class="btn ${t==='A'?'':'ghost'}" style="width:100%;justify-content:center" onclick="v8ds.stage='refine';renderStudioV8()">${t==='A'?'Selected — refine':'Select direction'}</button></div>`).join('')}</div>`;
  }
  if(v8ds.stage==='validate') return `<div class="v8panel" style="max-width:640px">${v8dsValidate()}</div>`;
  // handoff
  return `<div class="v8panel" style="max-width:720px"><div class="v8ph">Handoff readiness</div><p class="v8psub">Each output shows whether it is ready, partial or blocked — the main action follows the gaps.</p>
    <table class="tbl"><thead><tr><th>Output</th><th>Readiness</th><th>Missing</th></tr></thead><tbody>
    ${[['Style concept','Ready','—','var(--sage)'],['Surface brief','Required','Colourway not approved','var(--ochre)'],['Costing request','Partial','Supplier & construction','var(--ochre)'],['Tech-pack stub','Partial','Measurements & trims','var(--ochre)'],['Sample request','Blocked','Fabric not selected','var(--clay)']].map(([o,r,m,c])=>`<tr><td style="font-weight:600">${o}</td><td><span style="font-family:var(--d);font-size:10px;font-weight:700;color:${c}">${r}</span></td><td style="color:var(--ink-3);font-size:12px">${m}</td></tr>`).join('')}
    </tbody></table>
    <div style="display:flex;gap:8px;margin-top:16px"><button class="btn" onclick="go('surface')">Proceed to Surface Studio →</button><button class="btn ghost" onclick="toast('Preliminary costing requested')">Request costing</button></div></div>`;
}
function v8dsValidate(){
  return `<div class="v8ph">Validate · Sheer Rib Knit</div><p class="v8psub">Checks run against brand codes, the current collection and past sell-through. Production needs supplier &amp; PLM data — flagged, not faked.</p>
    ${[['ok','Brand coherence','Reads on-brand for the tonal, architectural codes.'],['ok','Collection duplication','No near-duplicate in the current AW26 line.'],['ok','Historical precedent','Close to two past knit styles that sold at 84% and 88% full-price.'],['warn','Data coverage','Knitwear above €180 is untested — ceiling unknown.'],['warn','Technical risk','Sheer gauge may not resolve cleanly in pattern software — review required.']].map(([t,k,v])=>`<div style="display:flex;gap:11px;padding:11px 0;border-top:1px solid var(--hair)"><span style="width:20px;height:20px;border-radius:50%;background:${t==='ok'?'var(--sage)':'var(--ochre)'};color:#fff;display:grid;place-items:center;font-size:11px;font-weight:700;flex:none;margin-top:1px">${t==='ok'?'✓':'!'}</span><div><div style="font-weight:600;font-size:13px">${k}</div><div style="font-size:12px;color:var(--ink-2);margin-top:2px;line-height:1.45">${v}</div></div></div>`).join('')}
    <div style="display:flex;gap:8px;margin-top:16px"><button class="btn" onclick="v8ds.stage='handoff';renderStudioV8()">Continue to handoff →</button><button class="btn ghost" onclick="toast('Logged as an intentional override')">Log override</button></div>`;
}
function v8dsRefine(){
  const c=v8ds.controls;
  return `<div class="v8ds-grid">
    ${v8dsBriefCard()}
    <div class="v8ds-imgs">
      <div class="v8ds-main">
        <div class="v8ds-fig tall"><img src="${IMG.knit}" referrerpolicy="no-referrer" onerror="this.style.display='none'"></div>
        <div class="v8ds-fig"><img src="${IMG.sheer}" referrerpolicy="no-referrer" onerror="this.style.display='none'"></div>
        <div class="v8ds-fig"><img src="${IMG.sunlit}" referrerpolicy="no-referrer" onerror="this.style.display='none'"></div>
      </div>
      <div class="v8ds-strip">${DS_VARIANTS.map((g,i)=>`<div class="t ${i===v8ds.variant?'on':''}" onclick="v8ds.variant=${i};renderStudioV8()">${mtile({color:COLORS[i%COLORS.length].h,fabric:'',garmentKey:g==='knit'?'knit':g==='tailor'?'blazer':'dress',img:IMG[g]||IMG.knit})}</div>`).join('')}</div>
    </div>
    <div class="v8panel">
      <div class="v8ph" style="margin-bottom:11px">Refine</div>
      <div class="v8refine-tabs">${['Silhouette','Details','Construction','Fabric','Fit'].map(t=>`<button class="v8rt ${v8ds.refineTab===t?'on':''}" onclick="v8ds.refineTab='${t}';renderStudioV8()">${t}</button>`).join('')}</div>
      <div class="v8rrow"><span class="v8lab">Length</span><select class="v8sel" onchange="v8ds.controls.length=this.value">${['Cropped','Hip','Tunic','Midi'].map(o=>`<option ${c.length===o?'selected':''}>${o}</option>`).join('')}</select></div>
      <div class="v8rrow"><div class="v8rl"><span>Ease</span><span class="val">Close</span></div><input type="range" class="v8slider" min="0" max="100" value="${c.ease}" oninput="v8ds.controls.ease=+this.value"></div>
      <div class="v8rrow"><span class="v8lab">Neckline</span><select class="v8sel" onchange="v8ds.controls.neckline=this.value">${['Crew','Mock','V-neck','Boat'].map(o=>`<option ${c.neckline===o?'selected':''}>${o}</option>`).join('')}</select></div>
      <div class="v8rrow"><span class="v8lab">Sleeve</span><select class="v8sel" onchange="v8ds.controls.sleeve=this.value">${['Short','Long','Volume','Cap'].map(o=>`<option ${c.sleeve===o?'selected':''}>${o}</option>`).join('')}</select></div>
      <div class="v8rrow"><div class="v8rl"><span>Transparency</span><span class="val">${c.transparency}%</span></div><input type="range" class="v8slider" min="0" max="100" value="${c.transparency}" oninput="v8ds.controls.transparency=+this.value;this.parentElement.querySelector('.val').textContent=this.value+'%'"></div>
      <div class="v8rrow"><div class="v8rl"><span>Rib width</span><span class="val">Fine</span></div><input type="range" class="v8slider" min="0" max="100" value="${c.rib}" oninput="v8ds.controls.rib=+this.value"></div>
      <div class="v8rrow"><span class="v8lab">Notes</span><textarea class="v8ta" rows="2" onchange="v8ds.controls.notes=this.value">${c.notes}</textarea></div>
    </div>
    <div class="v8panel">
      <div class="v8ph" style="margin-bottom:11px">Design intelligence</div>
      ${v8metric('Brand DNA fit','',86,'sage')}
      ${v8metric('Demand relevance','High',82,'sage')}
      ${v8metric('Market saturation','Medium',48,'ochre')}
      ${v8metric('Price acceptance','High',74,'sage')}
      ${v8metric('Return risk','Low',22,'sage')}
      ${v8metric('Development complexity','Medium',46,'ochre')}
      <div class="v8block-h">Similar in collection</div>
      <div class="v8sim">${['knit','slip','tailor'].map(g=>`<div class="f">${mtile({color:'#9A968B',fabric:'',garmentKey:g==='knit'?'knit':g==='tailor'?'blazer':'dress',img:IMG[g]})}</div>`).join('')}<span class="more">+2</span></div>
      <div class="v8block-h">Recommended</div>
      <div class="v8rec"><div class="t"><div class="v">280</div><div class="l">Test batch units</div></div><div class="t"><div class="v">2</div><div class="l">Colourways</div></div><div class="t"><div class="v">XS–XL</div><div class="l">Size run</div></div></div>
      <div class="v8intel-foot"><button class="btn ghost" onclick="toast('Saved as version v3')">Save as version</button><button class="btn" onclick="v8ds.stage='validate';renderStudioV8()">Continue to validate →</button></div>
    </div>
  </div>`;
}
window.renderStudioV8=renderStudioV8;

/* ============================================================
   SECTION 3 · SURFACE STUDIO — surface decision + spec
   ============================================================ */
const v8ss={tab:'Design',srcTab:'Source',view:'front',region:'Body',pattern:'Irregular Stripe',
  scale:24,rotation:0,opacity:100,linkSym:true,base:'#E9E6DF',stripe:'#CFCBBF',
  colorway:'Oat Milk',version:'V3',
  prompt:'Subtle tonal stripe with irregular spacing, in the brand’s neutral palette.'};
const CW=[['Oat Milk','#E9E6DF'],['Mushroom','#B8AC97'],['Olive Mist','#8B9079'],['Ink','#1B1A14']];
const SS_VERS=[['V1','knit'],['V2','knit'],['V3','knit']];

function v8ssPattern(){
  const w=Math.max(5,v8ss.scale/1.4);
  const svg=`<svg xmlns='http://www.w3.org/2000/svg' width='${w*2}' height='40'><rect width='${w*2}' height='40' fill='${encodeURIComponent(v8ss.base)}'/><rect width='${w}' height='40' fill='${encodeURIComponent(v8ss.stripe)}'/></svg>`;
  return `url("data:image/svg+xml,${svg.replace(/#/g,'%23')}")`;
}
function renderSurfaceStudioV8(){
  const host=$('view-surface'); if(!host) return;
  const pat=v8ssPattern();
  host.innerHTML=`
  <div class="v8wrap">
    <div class="v8oh">
      <div><div class="v8crumb">Surface Studio <span class="sep">›</span> KN-014 Sheer Rib Knit Top <span class="sep">›</span> <b>Surface ${v8ss.version}</b> <span class="v8pill review">In review</span></div></div>
      <div class="v8oh-right"><button class="v8mini" onclick="go('studio')">← Back to style</button><button class="v8mini" onclick="toast('History')"><svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.8" fill="none"><path d="M3 12a9 9 0 109-9 9 9 0 00-9 9zM3 3v6h6M12 7v5l3 3"/></svg></button></div>
    </div>
    <div class="v8tabs">${['Design','Technical','Placement','Compare'].map(t=>`<button class="v8tab ${v8ss.tab===t?'on':''}" onclick="${t==='Design'?"v8ss.tab='Design';renderSurfaceStudioV8()":"toast('"+t+" view')"}">${t}</button>`).join('')}</div>

    <div class="v8ss-grid">
      <!-- SOURCES -->
      <div class="v8panel">
        <div class="v8ss-srctabs">${['Source','Library','Upload'].map(t=>`<button class="v8ss-srctab ${v8ss.srcTab===t?'on':''}" onclick="v8ss.srcTab='${t}';renderSurfaceStudioV8()">${t}</button>`).join('')}</div>
        ${v8ss.srcTab==='Source'?`
          <textarea class="v8ta" rows="4" onchange="v8ss.prompt=this.value">${v8ss.prompt}</textarea>
          <button class="btn" style="width:100%;justify-content:center;margin-top:10px" onclick="v8ssGenerate()">Generate</button>
          <div class="v8block-h">Quick starts</div>
          <div class="v8qs">${['#CFCBBF','#B8AC97','#8B9079','#9A8E74'].map(c=>`<div class="q" style="background:repeating-linear-gradient(90deg,${c} 0 6px,#E9E6DF 6px 12px)" onclick="toast('Loaded quick-start surface')"></div>`).join('')}</div>
        `:v8ss.srcTab==='Library'?`<div class="v8block-h" style="margin-top:0">Brand archive</div><p class="v8note" style="font-size:11.5px;color:var(--ink-2);line-height:1.5">AW25 surfaces · SS25 colourways · historical prints. <span class="link">Connect archive →</span></p>`:`<div style="border:1.5px dashed var(--hair-2);border-radius:10px;padding:22px 12px;text-align:center;color:var(--ink-3)" onclick="toast('Upload repeat tile, scan or swatch')"><svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" fill="none" width="24" height="24" style="margin:0 auto 6px;display:block"><path d="M12 19V5M5 12l7-7 7 7"/></svg><div style="font-size:12px;font-weight:600;color:var(--ink-2)">Drop artwork</div></div>`}
      </div>

      <!-- CANVAS + COLORWAYS -->
      <div class="v8ss-canvas-wrap">
        <div class="v8ss-views">
          <div class="v8fb"><button class="${v8ss.view==='front'?'on':''}" onclick="v8ss.view='front';renderSurfaceStudioV8()">Front</button><button class="${v8ss.view==='back'?'on':''}" onclick="v8ss.view='back';renderSurfaceStudioV8()">Back</button></div>
          <div class="v8zoom"><button onclick="toast('Zoom in')">+</button><button>100%</button><button onclick="toast('Zoom out')">−</button></div>
          <div class="v8ss-view"><img src="${IMG.knit}" referrerpolicy="no-referrer" onerror="this.style.display='none'"><div class="v8ss-overlay" style="background-size:${v8ss.scale*1.3}px auto;transform:rotate(${v8ss.rotation}deg) scale(1.25);opacity:${v8ss.opacity/100*0.55}"></div><span class="lab">Front</span></div>
          <div class="v8ss-view"><img src="${IMG.knit}" referrerpolicy="no-referrer" style="transform:scaleX(-1)" onerror="this.style.display='none'"><div class="v8ss-overlay" style="background-size:${v8ss.scale*1.3}px auto;transform:rotate(${v8ss.rotation}deg) scale(1.25);opacity:${v8ss.opacity/100*0.55}"></div><span class="lab">Back</span></div>
        </div>
        <div class="v8cw">${CW.map(([nm,h])=>`<button class="v8cw-chip ${v8ss.colorway===nm?'on':''}" onclick="v8ss.colorway='${nm}';v8ss.base='${h==='#1B1A14'?'#2A2820':h}';renderSurfaceStudioV8()"><span class="sw" style="background:${h}"></span>${nm}</button>`).join('')}<span class="v8cw-add" onclick="toast('Add colourway')">+ Add colourway</span></div>
        <p style="font-family:var(--d);font-size:9.5px;color:var(--ink-3);margin:0;line-height:1.4">Preview maps the surface onto a representation of the garment. Photo-real rendering needs the image-edit model — kept honest, not implied.</p>
      </div>

      <!-- EDIT SURFACE -->
      <div class="v8panel">
        <div class="v8ph" style="margin-bottom:11px">Edit surface</div>
        <div class="v8rrow"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px"><span class="v8lab" style="margin:0">Region</span><div style="display:flex;align-items:center;gap:6px"><span style="font-family:var(--d);font-size:9px;color:var(--ink-3)">Link symmetry</span><span class="v8toggle ${v8ss.linkSym?'on':''}" onclick="v8ss.linkSym=!v8ss.linkSym;renderSurfaceStudioV8()"></span></div></div><select class="v8sel" onchange="v8ss.region=this.value">${['Body','Left sleeve','Right sleeve','Neckline','Hem'].map(o=>`<option ${v8ss.region===o?'selected':''}>${o}</option>`).join('')}</select></div>
        <div class="v8rrow"><span class="v8lab">Pattern</span><select class="v8sel" onchange="v8ss.pattern=this.value">${['Irregular Stripe','Fine Pinstripe','Tonal Marl','Solid','Birdseye'].map(o=>`<option ${v8ss.pattern===o?'selected':''}>${o}</option>`).join('')}</select></div>
        <div class="v8rrow"><div class="v8rl"><span>Scale</span><span class="val">${v8ss.scale}mm</span></div><input type="range" class="v8slider" min="6" max="60" value="${v8ss.scale}" oninput="v8ss.scale=+this.value;renderSurfaceStudioV8()"></div>
        <div class="v8rrow"><div class="v8rl"><span>Rotation</span><span class="val">${v8ss.rotation}°</span></div><input type="range" class="v8slider" min="-45" max="45" value="${v8ss.rotation}" oninput="v8ss.rotation=+this.value;renderSurfaceStudioV8()"></div>
        <div class="v8block-h" style="margin-bottom:4px">Colours</div>
        <div class="v8col2"><span class="lab"><span class="sw" style="background:${v8ss.base}"></span>Base</span><span class="hex">${v8ss.base.toUpperCase()}</span></div>
        <div class="v8col2" style="border-top:1px solid var(--hair)"><span class="lab"><span class="sw" style="background:${v8ss.stripe}"></span>Stripe</span><span class="hex">${v8ss.stripe.toUpperCase()}</span></div>
        <div class="v8rrow" style="margin-top:10px"><div class="v8rl"><span>Opacity</span><span class="val">${v8ss.opacity}%</span></div><input type="range" class="v8slider" min="0" max="100" value="${v8ss.opacity}" oninput="v8ss.opacity=+this.value;renderSurfaceStudioV8()"></div>
      </div>

      <!-- SURFACE INTELLIGENCE -->
      <div class="v8panel">
        <div class="v8ph" style="margin-bottom:11px">Surface intelligence</div>
        ${v8metric('Brand DNA fit','',88,'sage')}
        <div class="v8sint"><div class="t"><span class="k">Collection balance</span><span class="v" style="color:var(--sage)">Good</span></div><div class="c">Neutral palette, low colour saturation.</div></div>
        <div class="v8sint"><div class="t"><span class="k">Commercial impact</span><span class="v" style="color:var(--sage)">Positive</span></div><div class="c">Complements 4 other approved styles.</div></div>
        <div class="v8sint"><div class="t"><span class="k">Cost impact</span><span class="v" style="color:var(--ochre)">+4%</span></div><div class="c">Jacquard vs flat knit — supplier estimate.</div></div>
        <div class="v8sint"><div class="t"><span class="k">Supplier feasibility</span><span class="v" style="color:var(--sage)">High</span></div><div class="c">Digital knit jacquard available.</div></div>
        <div class="v8block-h">Versions</div>
        <div class="v8vers">${SS_VERS.map(([v,g])=>`<div class="vv ${v8ss.version===v?'on':''}" onclick="v8ss.version='${v}';renderSurfaceStudioV8()"><div class="img">${mtile({color:'#CDBFA6',fabric:'',garmentKey:'knit',img:IMG.knit})}</div><div class="vt">${v}</div></div>`).join('')}<div class="vv" onclick="v8ssCompare()" style="display:grid;place-items:center;font-family:var(--d);font-size:10px;color:var(--ink-3)">Compare</div></div>
      </div>

      <!-- SPECIFICATION READY -->
      <div>
        <div class="v8spec-card">
          <div class="v8spec-h"><span class="ok">✓</span>Specification ready</div>
          ${[['Repeat','24mm × 24mm'],['Placement','Body'],['Colours','2'],['Process','Digital knit jacquard'],['Fabric','100% viscose knit'],['File','AI · PDF · PNG']].map(([k,v])=>`<div class="v8spec-row"><span class="ck">✓</span><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}
        </div>
        <div class="v8ss-foot"><button class="btn" onclick="v8ssSpec()">Create supplier spec</button><button class="btn ghost" onclick="toast('Surface saved')">Save surface</button></div>
      </div>
    </div>
  </div>`;
}
// apply pattern backgrounds via JS (avoids quotes breaking inline style)
function v8ssPaint(){var p=v8ssPattern();document.querySelectorAll('#view-surface .v8ss-overlay').forEach(function(o){o.style.backgroundImage=p;});}
window.v8ssGenerate=function(){toast('Generated 4 surface variations · selectable swatches, not edited photos');renderSurfaceStudioV8();};
window.v8ssCompare=function(){openDrawer(`<div class="dr-card" style="margin-top:8px"><div class="ey" style="color:var(--cobalt)">Version comparison · V3 vs V2</div><h2 style="font-size:18px;margin-bottom:12px">What changed</h2>${[['Motif scale','18mm → 24mm'],['Rotation','0° → 0°'],['Base colour','Bone → Oat Milk'],['Est. print cost','−6%'],['Brand DNA fit','79 → 88']].map(([k,v])=>`<div style="display:flex;justify-content:space-between;padding:9px 0;border-top:1px solid var(--hair);font-size:13px"><span style="color:var(--ink-3)">${k}</span><span style="font-weight:600;font-family:var(--d);font-size:12px">${v}</span></div>`).join('')}<button class="btn ghost" style="margin-top:14px;width:100%" onclick="closeDrawer()">Close</button></div>`);};
window.v8ssSpec=function(){toast('Supplier specification created · V3 sent for strike-off');};
var _v8rss=renderSurfaceStudioV8;renderSurfaceStudioV8=function(){_v8rss();try{v8ssPaint();}catch(e){}};window.renderSurfaceStudioV8=renderSurfaceStudioV8;

/* ============================================================
   WIRING
   ============================================================ */
function v8Wire(){
  if(typeof RENDERERS==='object'){RENDERERS.collcreate=renderCollectionCreator;RENDERERS.surface=renderSurfaceStudioV8;RENDERERS.studio=renderStudioV8;}
  if(typeof TITLES==='object'){TITLES.collcreate='Collection Creator';TITLES.surface='Surface Studio';TITLES.studio='Design Studio';}
  document.querySelectorAll('.nav-item').forEach(n=>{
    if(n.dataset.view==='collcreate')n.childNodes.forEach(x=>{if(x.nodeType===3&&x.textContent.trim())x.textContent='Collection Creator';});
    if(n.dataset.view==='surface')n.childNodes.forEach(x=>{if(x.nodeType===3&&x.textContent.trim())x.textContent='Surface Studio';});
  });
  try{renderStudioV8();}catch(e){}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',v8Wire);else v8Wire();
window.v8cc=v8cc;window.v8ds=v8ds;window.v8ss=v8ss;
})();




/* ============================================================
   ATELIER v10 — Collection Creator as an editable planning instrument
   Builds on v9 architecture. Reuses globals: garment, shade, IMG,
   openDrawer, closeDrawer, toast, RENDERERS, TITLES.
   ============================================================ */
(function(){
"use strict";
const $=(id)=>document.getElementById(id);
const ROLE={Core:'var(--cobalt)',Directional:'var(--ember)',Seasonal:'var(--ochre)',Test:'var(--sage)'};
const CATS=['Knitwear','Dresses','Tops','Tailoring','Outerwear','Others'];
const TIERS=['Entry','Core','Premium','Hero'];

/* ---- commercial model (every display mode derives from this — labelled estimate) ---- */
const CATM={Knitwear:{price:180,cr:.40,depth:150},Dresses:{price:300,cr:.42,depth:120},Tops:{price:150,cr:.38,depth:160},Tailoring:{price:360,cr:.45,depth:95},Outerwear:{price:540,cr:.46,depth:80},Others:{price:190,cr:.40,depth:120}};
const TIERM={Entry:{p:.62,d:1.30,m:-4},Core:{p:1,d:1.10,m:0},Premium:{p:1.55,d:.75,m:5},Hero:{p:2.30,d:.50,m:9}};
function cellM(cat,ti,count){const m=CATM[cat],t=TIERM[TIERS[ti]];const price=Math.round(m.price*t.p);const units=Math.round(count*m.depth*t.d);return {count,price,units,revenue:units*price,margin:Math.round((1-m.cr)*100+t.m),sku:count*2};}
function fmtK(v){return v>=1000?(v/1000).toFixed(v>=10000?0:1)+'k':v;}
function fmtMoney(v){return v>=1e6?'€'+(v/1e6).toFixed(2)+'M':'€'+Math.round(v/1000)+'k';}

/* ---- scenario data: proposed + target matrices, evidence, editable assumptions, line ---- */
const SC={
 A:{name:'Commercial Confidence',tag:'Best for margin',tagBg:'#E7F0E9',tagInk:'var(--sage)',
    lead:'Leans on proven silhouettes and a deep commercial core. The lowest development risk and the strongest margin, with newness held back on purpose.',
    rationale:'Protect the margin and the core customer. Win on execution, not novelty.',
    prop:{Knitwear:[2,7,2,0],Dresses:[1,3,1,0],Tops:[2,3,0,0],Tailoring:[1,5,2,0],Outerwear:[0,2,1,0],Others:[1,1,0,0]},
    tgt:{Knitwear:[2,6,2,0],Dresses:[1,3,1,0],Tops:[2,4,0,0],Tailoring:[1,4,2,0],Outerwear:[0,2,1,0],Others:[1,2,0,0]},
    drops:[['August',14,100],['September',12,86],['October',8,57]],
    pro:[['Sell-through analogues run 82%+ on these blocks',{src:'Outcomes · 9 past styles',period:'last 4 seasons',mk:'Europe & UK',fresh:'updated weekly',conf:'High',contra:'None material'}],['Six proven hero attributes carried forward',{src:'Brand DNA · confirmed codes',period:'rolling',mk:'All',fresh:'team-confirmed',conf:'High',contra:'—'}],['Low markdown exposure — stock cover 4.6 weeks',{src:'Planning model',period:'projected',mk:'Europe & UK',fresh:'model estimate',conf:'Medium',contra:'Depends on opening buy'}]],
    con:[['Little to attract the adjacent younger customer',{src:'Consumer cohorts',period:'last 2 seasons',mk:'Europe',fresh:'client-provided',conf:'Medium',contra:'Core retention stays strong'}],['No hero pieces to drive desire or press',{src:'Range structure',period:'this proposal',mk:'—',fresh:'—',conf:'High',contra:'—'}]],
    conf:[['Demand',88,'sage'],['Brand fit',96,'sage'],['Cost',74,'ochre']],
    assume:{margin:61,octDrop:true,suppliers:'all'},
    sell:'82%',gmroi:'2.4×'},
 B:{name:'Balanced Growth',tag:'Recommended',tagBg:'var(--cobalt-wash)',tagInk:'var(--cobalt-ink)',rec:true,
    lead:'A strong commercial core with directional highlights in the categories that can carry them — elevated knits and soft tailoring — introducing relevant newness without unsettling the range.',
    rationale:'Grow the brand where the evidence already points, and let the core pay for it.',
    prop:{Knitwear:[2,6,2,1],Dresses:[1,4,2,1],Tops:[3,3,1,0],Tailoring:[0,3,2,1],Outerwear:[0,1,2,1],Others:[1,1,0,0]},
    tgt:{Knitwear:[2,5,2,1],Dresses:[1,4,2,1],Tops:[2,3,1,0],Tailoring:[0,4,2,1],Outerwear:[0,2,1,1],Others:[1,1,0,0]},
    drops:[['August',15,100],['September',14,93],['October',9,60]],
    pro:[['Sheer-layering signal accelerating at +142%',{src:'Signals · Instagram + resale',period:'12 weeks',mk:'Europe & UK',fresh:'updated daily',conf:'High',contra:'Competitor saturation rising in fast-fashion tier'}],['Adjacencies validated against two past winners',{src:'Outcomes · MR-KNT-114, MR-DRS-090',period:'last 3 seasons',mk:'Europe & UK',fresh:'tracked',conf:'High',contra:'Both sat below €200'}],['Balanced price ladder, no tier over-weighted',{src:'Range structure',period:'this proposal',mk:'—',fresh:'computed',conf:'High',contra:'—'}]],
    con:[['Margin gives up ~3 points versus the safe line',{src:'Planning model',period:'projected',mk:'—',fresh:'estimate',conf:'Medium',contra:'Offset by higher revenue'}],['Knitwear above €180 is still untested',{src:'Decision Memory',period:'all history',mk:'Europe & UK',fresh:'—',conf:'High',contra:'Adjacent fabric sells above €180'}]],
    conf:[['Demand',84,'sage'],['Brand fit',88,'sage'],['Cost',66,'ochre']],
    assume:{margin:58,octDrop:true,suppliers:'all'},
    sell:'78%',gmroi:'2.1×'},
 C:{name:'Brand Expansion',tag:'Most directional',tagBg:'var(--ember-wash)',tagInk:'var(--ember-ink)',
    lead:'Pushes the brand language with real novelty and a new occasion opportunity. Lower historic evidence, so the production strategy leans on test batches and staged commitment.',
    rationale:'Buy the future deliberately — small, staged, and watched.',
    prop:{Knitwear:[1,4,3,1],Dresses:[1,3,3,1],Tops:[1,3,2,0],Tailoring:[0,2,2,1],Outerwear:[0,1,2,1],Others:[1,2,1,0]},
    tgt:{Knitwear:[1,4,2,1],Dresses:[1,3,2,1],Tops:[1,3,2,0],Tailoring:[0,3,2,1],Outerwear:[0,1,2,1],Others:[1,2,1,0]},
    drops:[['August',12,80],['September',13,87],['October',11,73]],
    pro:[['Opens an occasion-dressing gap competitors are missing',{src:'Opportunities · whitespace map',period:'this season',mk:'Europe & UK',fresh:'updated weekly',conf:'Medium',contra:'Occasion demand is volatile'}],['Strongest acquisition pull with the younger customer',{src:'Consumer cohorts',period:'last 2 seasons',mk:'Europe',fresh:'client-provided',conf:'Medium',contra:'Lower repeat-purchase rate'}],['Highest revenue ceiling if the bets land',{src:'Planning model',period:'projected',mk:'—',fresh:'estimate',conf:'Low',contra:'Wide downside range'}]],
    con:[['Weak historic analogue above €240',{src:'Decision Memory',period:'all history',mk:'Europe & UK',fresh:'—',conf:'High',contra:'—'}],['Sheer fabrication may raise return risk',{src:'Returns data',period:'last 3 seasons',mk:'Europe',fresh:'client-provided',conf:'Medium',contra:'Fit fix could mitigate'}],['Supplier capability unconfirmed on two bets',{src:'Sourcing',period:'current',mk:'—',fresh:'open question',conf:'High',contra:'—'}]],
    conf:[['Demand',66,'ochre'],['Brand fit',72,'ochre'],['Cost',52,'clay']],
    assume:{margin:53,octDrop:true,suppliers:'all'},
    sell:'71%',gmroi:'1.8×'}
};
/* representative line per scenario — objects carry the Bet + matrix link */
function L(g,c,nm,role,cat,tier,price,extra){return Object.assign({g,c,nm,role,cat,tier,price},extra||{});}
const LINE={
 A:[L('coat','#4A4944','Char wool coat','Core','Outerwear',2,590),L('knit','#CDBFA6','Merino crew','Core','Knitwear',1,120),L('blazer','#3C4C68','Soft blazer','Core','Tailoring',2,390),L('trousers','#1B1A14','Wide trouser','Core','Tailoring',1,230),L('knit','#E7E1D3','Rib mock-neck','Core','Knitwear',1,150),L('dress','#9A968B','Bias slip','Directional','Dresses',2,320,{photo:IMG.slip}),L('tee','#B07A5B','Silk shirt','Core','Tops',1,180),L('skirt','#8B9079','Pleated skirt','Seasonal','Others',1,210),L('trousers','#3C4C68','Tapered denim','Core','Tailoring',1,200),L('knit','#9C4A2E','Cashmere zip','Directional','Knitwear',2,340)],
 B:[L('knit','#CDBFA6','Sheer rib knit','Directional','Knitwear',1,160,{photo:IMG.knit,hero:true,why:'A lightweight sheer rib knit captures the sheer-layering signal while fixing the “too transparent” complaint competitors get. Sits dead-on the tonal, architectural codes.',opp:'Sheer & layering',customer:'Core + adjacent younger',conf:'Medium-high'}),L('coat','#6E6A5C','Relaxed coat','Seasonal','Outerwear',3,560),L('dress','#B07A5B','Bias slip','Directional','Dresses',2,320,{photo:IMG.slip}),L('blazer','#4A4944','Soft blazer','Core','Tailoring',2,390),L('knit','#E7E1D3','Merino crew','Core','Knitwear',1,120),L('tee','#1B1A14','Silk shirt','Core','Tops',1,180),L('trousers','#1B1A14','Pleated trouser','Core','Tailoring',2,230),L('dress','#3C4C68','Mesh midi','Test','Dresses',2,240,{photo:IMG.sheer,why:'A test against rising occasion-mesh demand. Treat as directional, 200-unit test, olive and ink only.',opp:'Sheer & layering',customer:'Adjacent younger',conf:'Medium'}),L('skirt','#9C4A2E','Drop-waist skirt','Seasonal','Others',1,210),L('knit','#8B9079','Cashmere zip','Directional','Knitwear',2,340)],
 C:[L('dress','#9C4A2E','Mesh column','Test','Dresses',3,280,{photo:IMG.sheer,hero:true,why:'A statement occasion piece pushing the brand language into evening. Weak historic analogue above €240 — staged 150-unit test.',opp:'Occasion dressing',customer:'Younger acquisition',conf:'Low'}),L('knit','#B07A5B','Sheer layering knit','Directional','Knitwear',2,220,{photo:IMG.knit}),L('dress','#3C4C68','Occasion slip','Directional','Dresses',2,340,{photo:IMG.slip}),L('coat','#4A4944','Statement coat','Seasonal','Outerwear',3,640),L('tee','#1B1A14','Draped blouse','Directional','Tops',2,210),L('skirt','#B07A5B','Bias maxi skirt','Seasonal','Others',2,250),L('knit','#CDBFA6','Volume knit','Test','Knitwear',2,260),L('blazer','#6E6A5C','Deconstructed blazer','Directional','Tailoring',2,420),L('trousers','#1B1A14','Fluid trouser','Core','Tailoring',1,230),L('dress','#8B9079','Day-to-night dress','Directional','Dresses',2,300,{photo:IMG.sunlit})]
};

/* working state (proposed matrices are mutable; targets fixed) */
const v10={sel:'B',mode:'count',showVar:true,rail:'scenario',insCell:null,insStyle:0,locks:{},
  state:'Draft',work:{}};
function workMatrix(){ if(!v10.work[v10.sel]) v10.work[v10.sel]=JSON.parse(JSON.stringify(SC[v10.sel].prop)); return v10.work[v10.sel]; }
function lockKey(c,ti){return c+'|'+ti;}

function totals(mx){let count=0,units=0,revenue=0,sku=0,mw=0;CATS.forEach(c=>mx[c].forEach((n,ti)=>{const m=cellM(c,ti,n);count+=n;units+=m.units;revenue+=m.revenue;sku+=m.sku;mw+=m.margin*m.revenue;}));return {count,units,revenue,sku,margin:revenue?Math.round(mw/revenue):0};}
function cellDisplay(c,ti,n){const m=cellM(c,ti,n);if(v10.mode==='count')return n||0;if(v10.mode==='units')return n?fmtK(m.units):0;if(v10.mode==='revenue')return n?'€'+fmtK(m.revenue):0;if(v10.mode==='margin')return n?m.margin+'%':0;if(v10.mode==='sku')return n?m.sku:0;return n;}
function maxCell(mx){let mx2=0;CATS.forEach(c=>mx[c].forEach((n,ti)=>{const m=cellM(c,ti,n);const v=v10.mode==='units'?m.units:v10.mode==='revenue'?m.revenue:v10.mode==='sku'?m.sku:v10.mode==='margin'?m.margin:n;if(n||v10.mode==='margin')mx2=Math.max(mx2,v);}));return mx2||1;}
function heat(c,ti,n,max){if(!n)return 'transparent';const m=cellM(c,ti,n);const v=v10.mode==='units'?m.units:v10.mode==='revenue'?m.revenue:v10.mode==='sku'?m.sku:v10.mode==='margin'?m.margin:n;return `rgba(31,43,214,${Math.min(.22,(v/max)*0.22)})`;}

function render(){
  const host=$('view-collcreate'); if(!host) return;
  const s=SC[v10.sel], mx=workMatrix(), tgt=s.tgt, tot=totals(mx), tgtTot=totals(tgt), max=maxCell(mx);
  const line=LINE[v10.sel];
  host.innerHTML=`
  <div class="c9">
    <div class="c9-head">
      <div>
        <div class="c9-ey">Collection Creator</div>
        <h1 class="c9-title">AW26 Main <span class="yr">collection</span></h1>
        <div class="c9-meta"><span>State <b>${v10.state}</b></span><span class="dot">·</span><span>Markets <b>Europe & UK</b></span><span class="dot">·</span><span>Launch <b>Aug – Oct</b></span><span class="dot">·</span><span>Decision by <b>Jul 12</b></span></div>
      </div>
      <div class="c9-head-actions">
        <div class="c9-avs"><span class="c9-av">EL</span><span class="c9-av">MR</span><span class="c9-av" style="background:var(--ink);color:#fff">+3</span></div>
        <button class="btn ghost" onclick="toast('Share link copied')">Share</button>
        <button class="btn" onclick="v10gen()">✦ Generate scenarios</button>
      </div>
    </div>

    <div class="c9-lens">
      <div class="c9-lens-lab">Strategy</div>
      ${['A','B','C'].map(k=>{const sc=SC[k];return `<button class="c9-lensbtn ${k===v10.sel?'on':''}" onclick="v10pick('${k}')">
        <div class="ln"><span class="lk">${k}</span><span class="nm">${sc.name}</span><span class="tag" style="background:${sc.tagBg};color:${sc.tagInk}">${sc.tag}</span></div>
        <div class="figs"><span>${totals(SC[k].prop).count} styles</span><span>margin <b>${SC[k].assume.margin}%</b></span><span>newness <b>${k==='A'?'22%':k==='B'?'38%':'61%'}</b></span><span>risk <b>${k==='A'?'Low':k==='B'?'Med':'High'}</b></span></div>
      </button>`;}).join('')}
      <div class="c9-lens-cmp"><button class="c9-link" onclick="v10compare()">Compare ↔</button></div>
    </div>

    <div class="c9-work">
      <div>
        <h2 class="c9-scen-name">Scenario ${v10.sel} — ${s.name}</h2>
        <p class="c9-scen-lead">${s.lead}</p>

        <div class="c9-sec">
          <div class="c9-sec-h"><span class="t">Range architecture</span><span class="s">${tot.count} styles · click a cell to plan it</span></div>
          <div class="c10-mxbar">
            <div class="c10-modes">${[['count','Styles'],['units','Units'],['revenue','Revenue'],['margin','Margin'],['sku','SKUs']].map(([k,l])=>`<button class="c10-mode ${v10.mode===k?'on':''}" onclick="v10.mode='${k}';v10r()">${l}</button>`).join('')}</div>
            <label class="c10-vartog"><input type="checkbox" ${v10.showVar?'checked':''} onchange="v10.showVar=this.checked;v10r()"> show variance vs target</label>
          </div>
          <div class="c9-secscroll"><table class="c9-matrix">
            <thead><tr><th class="rl">Category</th>${TIERS.map(t=>`<th>${t}</th>`).join('')}<th class="tot">Total</th></tr></thead>
            <tbody>
              ${CATS.map(c=>{const row=mx[c];const rt=row.reduce((a,b)=>a+b,0);return `<tr><td class="rl">${c}</td>${row.map((n,ti)=>{const lk=v10.locks[lockKey(c,ti)];const selc=v10.insCell&&v10.insCell.c===c&&v10.insCell.ti===ti;const v=cellDisplay(c,ti,n);const vr=n-tgt[c][ti];return `<td><span class="c9-cell ${n?'':'zero'} ${selc?'sel':''} ${lk?'locked':''}" style="background:${heat(c,ti,n,max)}" onclick="v10cell('${c}',${ti})"><span class="c10-cellval ${v10.mode!=='count'?'sm':''}">${n?v:'·'}</span>${(v10.showVar&&v10.mode==='count'&&vr!==0&&n!==undefined)?`<span class="c10-var ${vr>0?'over':'under'}">${vr>0?'+':''}${vr}</span>`:''}</span></td>`;}).join('')}<td class="tot"><span class="totcell">${v10.mode==='revenue'?'€'+fmtK(CATS_rev(mx,c)):v10.mode==='units'?fmtK(CATS_units(mx,c)):rt}</span></td></tr>`;}).join('')}
              <tr class="totrow"><td class="rl">Total</td>${TIERS.map((t,ti)=>{let v;if(v10.mode==='revenue'){let r=0;CATS.forEach(c=>r+=cellM(c,ti,mx[c][ti]).revenue);v='€'+fmtK(r);}else if(v10.mode==='units'){let u=0;CATS.forEach(c=>u+=cellM(c,ti,mx[c][ti]).units);v=fmtK(u);}else if(v10.mode==='sku'){let k=0;CATS.forEach(c=>k+=mx[c][ti]*2);v=k;}else if(v10.mode==='margin'){v='';}else{let cc=0;CATS.forEach(c=>cc+=mx[c][ti]);v=cc;}return `<td>${v}</td>`;}).join('')}<td>${v10.mode==='revenue'?fmtMoney(tot.revenue):v10.mode==='units'?fmtK(tot.units):v10.mode==='sku'?tot.sku:v10.mode==='margin'?tot.margin+'%':tot.count}</td></tr>
            </tbody>
          </table></div>
          <div class="c9-mx-note"><span><span class="c9-mx-sw" style="background:rgba(31,43,214,.05)"></span>lighter = less</span><span><span class="c9-mx-sw" style="background:rgba(31,43,214,.20)"></span>denser = where the buy concentrates</span><span>· all figures model estimates</span></div>
        </div>

        <div class="c9-sec">
          <div class="c9-sec-h"><span class="t">The line</span><span class="s">click a piece to open its bet · ${line.length} of ${tot.count}</span></div>
          <div class="c9-line">${line.map((p,i)=>`<div class="c9-piece ${p.hero?'hero':''} ${p.role==='Test'?'test':''} ${v10.insStyle===i&&v10.rail==='style'?'sel':''}" onclick="v10style(${i})"><div class="c9-piece-fig">${garment(p.g,shade(p.c,46))}${p.photo?`<img src="${p.photo}" referrerpolicy="no-referrer" onerror="this.style.display='none'">`:''}<span class="c9-piece-role" style="background:${ROLE[p.role]}"></span>${p.role==='Test'?'<span class="c9-piece-flag" style="background:#E7F0E9;color:var(--sage)">Test</span>':p.hero?'<span class="c9-piece-flag" style="background:var(--ink);color:#fff">Hero</span>':''}</div><div class="c9-piece-nm">${p.nm}</div><div class="c9-piece-meta">€${p.price} · ${p.role}</div></div>`).join('')}</div>
          <div class="c9-line-foot">${Object.entries(ROLE).map(([k,v])=>`<span><span class="c9-rdot" style="background:${v}"></span>${k}</span>`).join('')}</div>
        </div>

        <div class="c9-sec" style="margin-bottom:8px">
          <div class="c9-sec-h"><span class="t">Delivery rhythm</span><span class="s">3 drops</span></div>
          <div class="c9-drops">${s.drops.map(([mo,ct,w])=>`<div class="c9-drop"><div class="mo">${mo}</div><div class="ct">${ct} styles arriving</div><div class="c9-drop-bar"><i style="width:${w}%"></i></div></div>`).join('')}</div>
        </div>
      </div>

      <aside class="c9-side">
        <div class="c10-railtabs" style="border:none;padding:0;margin-bottom:0">
          <button class="c10-railtab ${v10.rail==='scenario'?'on':''}" onclick="v10.rail='scenario';v10r()">Scenario</button>
          <button class="c10-railtab ${v10.rail!=='scenario'?'on':''}" ${v10.rail==='scenario'&&!v10.insCell&&v10.insStyle==null?'disabled':''} onclick="v10.rail='${v10.insCell?'cell':'style'}';v10r()">Selection</button>
        </div>
        <div style="padding-top:16px">${v10.rail==='scenario'?railScenario(s,tot,tgtTot):v10.rail==='cell'?railCell(s,mx,tgt):railStyle(line[v10.insStyle])}</div>
      </aside>
    </div>

    <div class="c9-bar">
      <div class="c9-bar-l"><span class="c10-state ${v10.state==='Working range'?'working':v10.state==='Under review'?'review':''}"><span class="d"></span>${v10.state}</span> &nbsp; Scenario ${v10.sel} · ${tot.count} styles${v10.state==='Draft'?' · AI proposal':''}</div>
      <div class="c9-bar-r">
        <button class="c9-link" onclick="v10compare()">Compare</button>
        <button class="c9-link" onclick="toast('Merge — pick styles from each scenario')">Merge</button>
        ${v10.state==='Draft'?`<button class="btn ghost" onclick="v10setState('Working range')">Select as working range</button>`:v10.state==='Working range'?`<button class="btn ghost" onclick="v10setState('Under review')">Submit for range review</button>`:`<button class="btn ghost" onclick="v10setState('Approved');toast('Range approved — logged to Decision Memory')">Approve range</button>`}
        <button class="btn" onclick="v10briefs()">Create style briefs →</button>
      </div>
    </div>
  </div>`;
}
function CATS_rev(mx,c){let r=0;mx[c].forEach((n,ti)=>r+=cellM(c,ti,n).revenue);return r;}
function CATS_units(mx,c){let u=0;mx[c].forEach((n,ti)=>u+=cellM(c,ti,n).units);return u;}

/* ---- right rail: scenario mode ---- */
function railScenario(s,tot,tgtTot){
  const rev=tot.revenue, lo=Math.round(rev*0.90), hi=Math.round(rev*1.12);
  const conf=v10.sel==='A'?'High':v10.sel==='B'?'Medium':'Low';
  return `
    <div><div class="c9-side-h">Why this strategy</div><p class="c9-rationale">${s.rationale}</p></div>
    <div><div class="c9-side-h">Supporting evidence <span style="text-transform:none;letter-spacing:0;color:var(--ink-3)">· tap for source</span></div>${s.pro.map((x,i)=>`<div class="c9-ev pro" onclick="v10prov('${v10.sel}','pro',${i})"><span class="m">+</span><span>${x[0]}<span class="src">${x[1].src} ›</span></span></div>`).join('')}</div>
    <div><div class="c9-side-h">What could make it wrong</div>${s.con.map((x,i)=>`<div class="c9-ev con" onclick="v10prov('${v10.sel}','con',${i})"><span class="m">−</span><span>${x[0]}<span class="src">${x[1].src} ›</span></span></div>`).join('')}</div>
    <div><div class="c9-side-h">Confidence</div><div class="c9-conf">${s.conf.map(([k,v,t])=>`<div class="c9-conf-row"><span class="k">${k}</span><span class="c9-conf-bar"><i style="width:${v}%;background:var(--${t})"></i></span><span class="w" style="color:var(--${t})">${v>=80?'High':v>=62?'Medium':'Low'}</span></div>`).join('')}</div></div>
    <div><div class="c9-side-h">Key assumptions</div>
      <div class="c9-assume">
        <div><span class="k">Markets</span><span class="v">Europe & UK</span></div>
        <div><span class="k">Drops</span><span class="v">${s.assume.octDrop?'Aug / Sep / Oct':'Aug / Sep'}</span></div>
        <div><span class="k">Target margin</span><span class="v">${s.assume.margin}%</span></div>
        <div><span class="k">Suppliers</span><span class="v">${s.assume.suppliers==='all'?'All':'Confirmed only'}</span></div>
      </div>
      <span class="c10-adjust" onclick="v10adjust()">Adjust assumptions & recalculate →</span>
    </div>
    <div><div class="c9-side-h">Expected performance</div>
      <div style="margin-bottom:14px"><div class="c9-perf" style="grid-template-columns:1fr"><div><div class="v">${fmtMoney(rev)} <span class="c10-prov est">est</span></div><div class="l">Revenue · central estimate</div>
        <div class="c10-range"><span class="lo">${fmtMoney(lo)}</span><span class="track"><span class="fill" style="left:0;right:0"></span><span class="mid" style="left:${Math.round((rev-lo)/(hi-lo)*100)}%"></span></span><span class="hi">${fmtMoney(hi)}</span></div>
        <div style="font-family:var(--d);font-size:9px;color:var(--ink-3);margin-top:4px">confidence: ${conf} · range ±${Math.round((hi-lo)/2/rev*100)}%</div></div></div></div>
      <div class="c9-perf">
        <div><div class="v">${tot.margin}% <span class="c10-prov est">est</span></div><div class="l">Gross margin</div></div>
        <div><div class="v">${s.gmroi} <span class="c10-prov assume">assume</span></div><div class="l">GMROI</div></div>
        <div><div class="v">${s.sell} <span class="c10-prov assume">assume</span></div><div class="l">Sell-through</div></div>
        <div><div class="v">${tot.sku} <span class="c10-prov actual">plan</span></div><div class="l">SKU count</div></div>
      </div>
    </div>`;
}
/* ---- right rail: cell mode ---- */
function railCell(s,mx,tgt){
  const {c,ti}=v10.insCell; const n=mx[c][ti], t=tgt[c][ti], m=cellM(c,ti,n), lk=v10.locks[lockKey(c,ti)];
  const prods=LINE[v10.sel].filter(p=>p.cat===c&&p.tier===ti);
  const vr=n-t;
  return `
    <a class="c10-back" onclick="v10.rail='scenario';v10r()">‹ Scenario intelligence</a>
    <div class="c10-ins-h"><div class="c10-ins-t">${c} · ${TIERS[ti]}</div><button class="c10-act" onclick="v10lock('${c}',${ti})">${lk?'🔒 Locked':'Lock cell'}</button></div>
    <div class="c10-ins-sub">cell in the range matrix · ${TIERS[ti]} price tier</div>
    <div class="c10-tvp">
      <div class="b"><div class="v">${t}</div><div class="l">Target</div></div>
      <div class="b ${vr!==0?'flag':''}"><div class="v">${n}</div><div class="l">Proposed</div></div>
      <div class="b"><div class="v">${vr>0?'+'+vr:vr}</div><div class="l">Variance</div></div>
    </div>
    <div class="c10-bet">
      <div class="c10-bet-row"><span class="k">Est. opening units</span><span class="v">${fmtK(m.units)} <span class="c10-prov est">est</span></span></div>
      <div class="c10-bet-row"><span class="k">Est. revenue</span><span class="v">${fmtMoney(m.revenue)}</span></div>
      <div class="c10-bet-row"><span class="k">Avg. price · tier</span><span class="v">€${m.price}</span></div>
      <div class="c10-bet-row"><span class="k">Est. margin</span><span class="v">${m.margin}%</span></div>
      <div class="c10-bet-row"><span class="k">SKUs · 2 cw</span><span class="v">${m.sku}</span></div>
    </div>
    ${prods.length?`<div class="c9-side-h" style="margin-top:16px">Styles in this cell</div><div class="c10-cellprods">${prods.map(p=>`<div class="c10-cellprod" onclick="v10styleByName('${p.nm.replace(/'/g,"\\'")}')"><div class="f">${garment(p.g,shade(p.c,46))}</div><span class="nm">${p.nm}</span><span class="pr">€${p.price}</span></div>`).join('')}</div>`:`<div class="c9-side-h" style="margin-top:16px">Styles in this cell</div><p style="font-size:12px;color:var(--ink-3)">No representative style listed yet for this cell.</p>`}
    <div class="c10-actions">
      <button class="c10-act primary" onclick="v10cellAdd('${c}',${ti},1)">+ Add style</button>
      <button class="c10-act" onclick="v10cellAdd('${c}',${ti},-1)">− Remove</button>
      <button class="c10-act" onclick="toast('Move flow — drag target tier (prototype)')">Move tier</button>
      <button class="c10-act" onclick="toast('Regenerated this cell from the brief')">Regenerate cell</button>
    </div>`;
}
/* ---- right rail: style (Bet) mode ---- */
function railStyle(p){
  if(!p)return '<p style="font-size:12px;color:var(--ink-3)">Select a style from the line.</p>';
  const m=CATM[p.cat]; const cost=Math.round(p.price*m.cr); const margin=Math.round((1-m.cr)*100); const units=p.role==='Test'?200:Math.round(m.depth*TIERM[TIERS[p.tier]].d);
  return `
    <a class="c10-back" onclick="v10.rail='scenario';v10r()">‹ Scenario intelligence</a>
    <div class="c10-ins-h"><div class="c10-ins-t">${p.nm}</div><span class="c9-rdot" style="background:${ROLE[p.role]};width:10px;height:10px;margin-top:7px"></span></div>
    <div class="c10-ins-sub">${p.cat} · ${TIERS[p.tier]} · ${p.role}</div>
    <div class="c9-side-h">The bet</div>
    <p class="c10-why">${p.why||`A ${p.role.toLowerCase()} ${p.cat.toLowerCase()} piece that ${p.role==='Core'?'anchors the everyday range':p.role==='Directional'?'carries the season’s point of view':p.role==='Test'?'tests a new demand pocket before committing depth':'broadens the seasonal story'}.`}</p>
    <div class="c10-bet">
      <div class="c10-bet-row"><span class="k">Opportunity</span><span class="v">${p.opp||'Range coherence'}</span></div>
      <div class="c10-bet-row"><span class="k">Target customer</span><span class="v">${p.customer||'Core'}</span></div>
      <div class="c10-bet-row"><span class="k">Target retail</span><span class="v">€${p.price}</span></div>
      <div class="c10-bet-row"><span class="k">Target cost</span><span class="v">€${cost} <span class="c10-prov est">est</span></span></div>
      <div class="c10-bet-row"><span class="k">Expected margin</span><span class="v">${margin}%</span></div>
      <div class="c10-bet-row"><span class="k">Opening quantity</span><span class="v">${units} units</span></div>
      <div class="c10-bet-row"><span class="k">Recommendation</span><span class="v">${p.role==='Test'?'Test batch':'Scale'}</span></div>
      <div class="c10-bet-row"><span class="k">Confidence</span><span class="v">${p.conf||(p.role==='Test'?'Low':p.role==='Core'?'High':'Medium')}</span></div>
    </div>
    <div class="c9-side-h" style="margin-top:14px">Collection impact</div>
    <div class="c10-bet">
      <div class="c10-bet-row"><span class="k">Duplication risk</span><span class="v" style="color:var(--sage)">Low</span></div>
      <div class="c10-bet-row"><span class="k">Outfit links</span><span class="v">${2+(p.tier||1)} looks</span></div>
      <div class="c10-bet-row"><span class="k">Adds to ${p.cat}</span><span class="v">+1 in ${TIERS[p.tier]}</span></div>
    </div>
    <div class="c10-actions">
      <button class="c10-act primary" onclick="toast('“${p.nm}” sent to Design Studio'); ">Send to Design Studio</button>
      <button class="c10-act" onclick="v10styleRole(${LINE[v10.sel].indexOf(p)})">Change role</button>
      <button class="c10-act" onclick="toast('Move price tier (prototype)')">Move tier</button>
      <button class="c10-act danger" onclick="v10styleRemove(${LINE[v10.sel].indexOf(p)})">Remove</button>
    </div>`;
}

/* ---- interactions ---- */
window.v10r=render;
window.v10pick=function(k){v10.sel=k;v10.insCell=null;v10.insStyle=0;v10.rail='scenario';render();};
window.v10gen=function(){toast('Re-generated 3 strategies from the brief and live brand DNA');render();};
window.v10cell=function(c,ti){v10.insCell={c,ti};v10.rail='cell';render();};
window.v10style=function(i){v10.insStyle=i;v10.insCell=null;v10.rail='style';render();};
window.v10styleByName=function(nm){const i=LINE[v10.sel].findIndex(p=>p.nm===nm);if(i>=0){v10.insStyle=i;v10.rail='style';render();}};
window.v10lock=function(c,ti){const k=c+'|'+ti;v10.locks[k]=!v10.locks[k];render();toast(v10.locks[k]?'Cell locked — protected from regeneration':'Cell unlocked');};
window.v10cellAdd=function(c,ti,d){const k=c+'|'+ti;if(v10.locks[k]){toast('Cell is locked');return;}const mx=workMatrix();mx[c][ti]=Math.max(0,mx[c][ti]+d);const t=totals(mx);render();toast(`${c} · ${TIERS[ti]} → ${mx[c][ti]} styles · range now ${t.count}, ${fmtMoney(t.revenue)} est.`);};
window.v10styleRole=function(i){const p=LINE[v10.sel][i];const order=['Core','Directional','Seasonal','Test'];p.role=order[(order.indexOf(p.role)+1)%order.length];render();toast(p.nm+' → '+p.role);};
window.v10styleRemove=function(i){const p=LINE[v10.sel][i];LINE[v10.sel].splice(i,1);const mx=workMatrix();if(mx[p.cat]&&mx[p.cat][p.tier]>0)mx[p.cat][p.tier]--;v10.rail='scenario';v10.insStyle=0;render();toast('Removed '+p.nm+' · range recalculated');};
window.v10setState=function(st){v10.state=st;render();toast('State → '+st);};
window.v10prov=function(sel,kind,i){const e=SC[sel][kind][i];const d=e[1];
  openDrawer(`<div class="dr-card" style="margin-top:8px"><div class="ey" style="color:${kind==='pro'?'var(--sage)':'var(--clay)'}">${kind==='pro'?'Supporting evidence':'Counter-evidence'}</div><h2 style="font-family:var(--serif);font-weight:500;font-size:21px;margin:4px 0 14px;line-height:1.25">${e[0]}</h2>
    ${[['Source',d.src],['Observation period',d.period],['Market',d.mk],['Data freshness',d.fresh],['Confidence',d.conf],['Contradictory findings',d.contra]].map(([k,v])=>`<div style="display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-top:1px solid var(--hair);font-size:13px"><span style="color:var(--ink-3)">${k}</span><span style="font-weight:600;text-align:right;max-width:60%">${v}</span></div>`).join('')}
    <button class="btn ghost" style="margin-top:14px;width:100%" onclick="closeDrawer()">Close</button></div>`);
};
window.v10adjust=function(){
  const s=SC[v10.sel];const baseRev=totals(workMatrix()).revenue;
  openDrawer(`<div class="dr-card" style="margin-top:8px"><div class="ey" style="color:var(--cobalt)">Adjust assumptions</div><h2 style="font-family:var(--serif);font-weight:500;font-size:22px;margin:4px 0 6px">Recalculate the scenario</h2>
    <p style="font-size:12px;color:var(--ink-3);margin-bottom:16px">Change an input and Atelier re-estimates the consequence. Nothing is committed until you apply.</p>
    <label style="display:block;margin-bottom:14px"><div style="display:flex;justify-content:space-between;font-size:13px;font-weight:600"><span>Target margin</span><span id="v10am">${s.assume.margin}%</span></div><input id="v10ms" type="range" min="50" max="66" value="${s.assume.margin}" style="width:100%" oninput="v10effect()"></label>
    <label style="display:flex;align-items:center;gap:10px;margin-bottom:12px;font-size:13px"><input id="v10oct" type="checkbox" ${s.assume.octDrop?'checked':''} onchange="v10effect()"> Include October delivery</label>
    <label style="display:flex;align-items:center;gap:10px;margin-bottom:6px;font-size:13px"><input id="v10sup" type="checkbox" ${s.assume.suppliers!=='all'?'checked':''} onchange="v10effect()"> Exclude unconfirmed suppliers</label>
    <div id="v10fx" class="c10-effect show" style="margin-top:14px">Adjust an input to see the modelled effect.</div>
    <div style="display:flex;gap:8px;margin-top:16px"><button class="btn" onclick="v10applyAdjust()">Apply & recalculate</button><button class="btn ghost" onclick="closeDrawer()">Cancel</button></div>
  </div>`);
  window.__v10base=baseRev;
};
window.v10effect=function(){
  const s=SC[v10.sel];const base=window.__v10base||totals(workMatrix()).revenue;
  const margin=+($('v10ms')?$('v10ms').value:s.assume.margin); if($('v10am'))$('v10am').textContent=margin+'%';
  const oct=$('v10oct')?$('v10oct').checked:s.assume.octDrop; const supEx=$('v10sup')?$('v10sup').checked:false;
  let dRev=0, notes=[];
  if(margin>s.assume.margin){const drop=(margin-s.assume.margin)*0.018;dRev-=Math.round(base*drop);notes.push(`${margin-s.assume.margin}pt higher margin trims ~${Math.round(drop*100)}% of premium depth`);}
  if(!oct){dRev-=Math.round(base*0.16);notes.push('removing October delivery drops ~16% of revenue and lowers inventory exposure');}
  if(supEx){dRev-=Math.round(base*0.05);notes.push('excluding unconfirmed suppliers moves 2 bets to test status');}
  const fx=$('v10fx'); if(fx) fx.innerHTML = dRev===0?'No change yet — adjust an input above.':`Revenue estimate ${dRev<0?'−':'+'}${fmtMoney(Math.abs(dRev))} → <b>${fmtMoney(base+dRev)}</b>. ${notes.join('; ')}.`;
};
window.v10applyAdjust=function(){const s=SC[v10.sel];if($('v10ms'))s.assume.margin=+$('v10ms').value;if($('v10oct'))s.assume.octDrop=$('v10oct').checked;if($('v10sup'))s.assume.suppliers=$('v10sup').checked?'confirmed':'all';closeDrawer();render();toast('Scenario recalculated with new assumptions');};
window.v10compare=function(){
  const rows=[['Styles',k=>totals(SC[k].prop).count],['Revenue · est',k=>fmtMoney(totals(SC[k].prop).revenue)],['Gross margin',k=>SC[k].assume.margin+'%'],['GMROI',k=>SC[k].gmroi],['Sell-through',k=>SC[k].sell],['Newness',k=>k==='A'?'22%':k==='B'?'38%':'61%'],['Brand DNA alignment',k=>SC[k].conf[1][1]],['Acquisition pull',k=>k==='C'?'High':k==='B'?'Medium':'Low'],['Core retention',k=>k==='A'?'High':k==='B'?'High':'Medium'],['Category gaps',k=>k==='A'?'Occasion thin':k==='B'?'Balanced':'Core thin'],['Supplier exposure',k=>k==='C'?'2 unconfirmed':'Low'],['Downside risk',k=>k==='A'?'Low':k==='B'?'Medium':'High']];
  openDrawer(`<div class="dr-card" style="margin-top:8px;max-width:680px"><div class="ey" style="color:var(--cobalt)">Scenario comparison</div><h2 style="font-family:var(--serif);font-weight:500;font-size:24px;margin-bottom:14px">Three strategies, one decision</h2>
    <div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Dimension</th>${['A','B','C'].map(k=>`<th style="text-align:right">${SC[k].name}</th>`).join('')}</tr></thead><tbody>
    ${rows.map(([lbl,fn])=>`<tr><td style="font-weight:600">${lbl}</td>${['A','B','C'].map(k=>`<td style="text-align:right;font-family:var(--d);font-size:12px">${fn(k)}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>
    <p style="font-size:11px;color:var(--ink-3);margin-top:12px">Estimates on each scenario’s stated assumptions, not committed forecasts.</p>
    <div style="display:flex;gap:8px;margin-top:12px">${['A','B','C'].map(k=>`<button class="btn ${k===v10.sel?'':'ghost'}" style="flex:1;justify-content:center" onclick="v10pick('${k}');closeDrawer()">Use ${k}</button>`).join('')}</div></div>`);
};
window.v10briefs=function(){
  const line=LINE[v10.sel];
  openDrawer(`<div class="dr-card" style="margin-top:8px;max-width:640px"><div class="ey" style="color:var(--cobalt)">Create style briefs · Scenario ${v10.sel}</div><h2 style="font-family:var(--serif);font-weight:500;font-size:23px;margin-bottom:4px">${SC[v10.sel].name}</h2>
    <p style="font-size:12px;color:var(--ink-3);margin-bottom:14px">Each accepted style opens a brief in Design Studio carrying its full rationale, evidence and locked attributes.</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px 14px;margin-bottom:16px;padding:12px;background:var(--paper-2);border-radius:10px">
      <label style="font-size:12px"><div style="font-family:var(--d);font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin-bottom:3px">Assign designer</div><select class="v8sel"><option>Elena R.</option><option>Marco T.</option><option>Unassigned</option></select></label>
      <label style="font-size:12px"><div style="font-family:var(--d);font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin-bottom:3px">Due date</div><select class="v8sel"><option>Jul 19</option><option>Jul 26</option><option>Aug 2</option></select></label>
      <label style="font-size:12px"><div style="font-family:var(--d);font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin-bottom:3px">Priority</div><select class="v8sel"><option>Standard</option><option>High</option></select></label>
      <label style="font-size:12px"><div style="font-family:var(--d);font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin-bottom:3px">Required colourways</div><select class="v8sel"><option>2</option><option>1</option><option>3</option></select></label>
      <label style="display:flex;align-items:center;gap:8px;font-size:12px"><input type="checkbox" checked> Surface Studio required</label>
      <label style="display:flex;align-items:center;gap:8px;font-size:12px"><input type="checkbox"> Request costing</label>
    </div>
    <div style="font-family:var(--d);font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink-3);margin-bottom:6px">Styles</div>
    ${line.map((p,i)=>`<label style="display:flex;align-items:center;gap:11px;padding:8px 0;border-top:1px solid var(--hair)"><input type="checkbox" ${i<6?'checked':''} style="width:15px;height:15px"><div style="width:26px;height:34px;border-radius:5px;background:var(--paper-2);display:grid;place-items:center">${garment(p.g,shade(p.c,46))}</div><div style="flex:1"><div style="font-weight:600;font-size:13px">${p.nm}</div><div style="font-family:var(--d);font-size:10px;color:var(--ink-3)">€${p.price} · ${p.role} · ${p.cat}</div></div></label>`).join('')}
    <div style="display:flex;gap:8px;margin-top:16px"><button class="btn" onclick="closeDrawer();toast('Briefs created in Design Studio with rationale & locks')">Create briefs for accepted</button><button class="btn ghost" onclick="closeDrawer()">Cancel</button></div></div>`);
};
window.renderCollectionCreator=render;

function wire(){ if(typeof RENDERERS==='object') RENDERERS.collcreate=render; if(typeof TITLES==='object') TITLES.collcreate='Collection Creator'; }
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',wire);else wire();
window.v10=v10;
})();

