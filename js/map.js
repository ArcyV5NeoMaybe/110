const USA_TOPO_URL="https://cdn.jsdelivr.net/npm/us-atlas@3/states-albers-10m.json";
const D3_URL="https://cdn.jsdelivr.net/npm/d3@7/+esm";
const TOPOJSON_URL="https://cdn.jsdelivr.net/npm/topojson-client@3/+esm";

let usaMapState={svg:null,selectedProvince:null,selectedState:null};

async function loadMapData(){
    const [d3,topojson,topology,states,cities]=await Promise.all([
        import(D3_URL),
        import(TOPOJSON_URL),
        fetch(USA_TOPO_URL).then(r=>r.json()),
        fetch("data/states.json").then(r=>r.json()),
        fetch("data/cities.json").then(r=>r.json())
    ]);
    return {d3:d3.default||d3,topojson:topojson.default||topojson,topology,states,cities};
}

function provinceSeeds(bounds,index){
    const [[x0,y0],[x1,y1]]=bounds;
    const patterns=[
        [[.22,.25],[.50,.18],[.78,.25],[.18,.50],[.48,.45],[.80,.50],[.25,.76],[.52,.72],[.78,.78],[.50,.94]],
        [[.18,.20],[.48,.18],[.78,.20],[.28,.43],[.62,.40],[.90,.45],[.12,.70],[.42,.68],[.70,.70],[.50,.92]]
    ];
    return patterns[index%patterns.length].map(([x,y])=>[x0+(x1-x0)*x,y0+(y1-y0)*y]);
}

function buildProvinces(d3,svg,stateFeature,stateCode){
    const projection=d3.geoAlbersUsa().scale(1300).translate([487.5,305]);
    const path=d3.geoPath(projection);
    const bounds=path.bounds(stateFeature);
    const seeds=provinceSeeds(bounds,parseInt(stateCode,10)||0);
    const delaunay=d3.Delaunay.from(seeds);
    const voronoi=delaunay.voronoi([bounds[0][0],bounds[0][1],bounds[1][0],bounds[1][1]]);
    const clipId=`clip-${stateCode}`;
    const defs=svg.select("defs");
    const clip=defs.append("clipPath").attr("id",clipId);
    clip.append("path").datum(stateFeature).attr("d",path);
    const group=svg.append("g").attr("class","province-group").attr("clip-path",`url(#${clipId})`);
    for(let i=0;i<10;i++){
        const poly=voronoi.cellPolygon(i);
        if(!poly) continue;
        group.append("path")
            .attr("class","province-shape")
            .attr("id",`${stateCode}_${String(i+1).padStart(2,"0")}`)
            .attr("d",`M${poly.map(p=>p.join(",")).join("L")}Z`)
            .attr("data-state",stateCode)
            .attr("data-province",`${stateCode}_${String(i+1).padStart(2,"0")}`)
            .on("click",(event)=>{
                event.stopPropagation();
                selectProvince(stateCode,`${stateCode}_${String(i+1).padStart(2,"0")}`);
            });
    }
}

function selectProvince(stateCode,provinceId){
    usaMapState.selectedProvince=provinceId;
    usaMapState.selectedState=stateCode;
    document.querySelectorAll(".province-shape.selected").forEach(el=>el.classList.remove("selected"));
    const el=document.getElementById(provinceId);
    if(el) el.classList.add("selected");
    const stateEl=document.querySelector(`.state-shape[data-state="${stateCode}"]`);
    document.querySelectorAll(".state-shape.selected").forEach(x=>x.classList.remove("selected"));
    if(stateEl) stateEl.classList.add("selected");
    const city=citiesByProvince.get(provinceId);
    const panel=document.getElementById("map-panel");
    if(panel) panel.innerHTML=`<strong>${provinceId}</strong><span>State: ${stateNames.get(stateCode)||stateCode}</span>${city?`<br><span>City: ${city}</span>`:""}<br><span>Owner: USA</span>`;
}

let stateNames=new Map();
let citiesByProvince=new Map();

async function initUSAMap(){
    const shell=document.getElementById("usa-map-shell");
    if(!shell) return;
    const {d3,topojson,topology,states,cities}=await loadMapData();
    const fipsToAbbr=new Map(states.map(s=>[String(s.fips),s.id]));
    stateNames=new Map(states.map(s=>[String(s.id),s.name]));
    citiesByProvince=new Map(cities.map(c=>[c.province,c.name]));
    shell.innerHTML='<svg id="usa-map" viewBox="0 0 975 610" preserveAspectRatio="xMidYMid meet"></svg><div class="map-panel" id="map-panel"><strong>United States</strong><span>50 states · 500 provinces</span><br><span>Click a province</span></div>';
    const svg=d3.select("#usa-map");
    usaMapState.svg=svg;
    svg.append("defs");
    svg.append("rect").attr("class","map-bg").attr("x",0).attr("y",0).attr("width",975).attr("height",610);
    svg.append("text").attr("class","map-title").attr("x",22).attr("y",34).text("UNITED STATES");
    svg.append("text").attr("class","map-subtitle").attr("x",22).attr("y",54).text("50 STATES · 500 PROVINCES");
    const statesFeature=topojson.feature(topology,topology.objects.states);
    const projection=d3.geoAlbersUsa().scale(1300).translate([487.5,305]);
    const path=d3.geoPath(projection);
    svg.append("g").selectAll("path").data(statesFeature.features).join("path")
        .attr("class","state-shape")
        .attr("data-state",d=>fipsToAbbr.get(String(d.id).padStart(2,"0")))
        .attr("d",path)
        .style("fill",(d,i)=>`hsl(${i*31%360} 25% 25%)`)
        .on("click",(event,d)=>{
            event.stopPropagation();
            const code=String(d.id).padStart(2,"0");
            const abbr=fipsToAbbr.get(code);
            if(abbr) selectProvince(abbr,`${abbr}_01`);
        });
    statesFeature.features.forEach(f=>{
        const fipsCode=String(f.id).padStart(2,"0");
        const code=fipsToAbbr.get(fipsCode);
        if(code) buildProvinces(d3,svg,f,code);
    });
    const cityLayer=svg.append("g");
    for(const city of cities){
        const c=projection([city.lon,city.lat]);
        if(!c||!Number.isFinite(c[0])||!Number.isFinite(c[1])) continue;
        cityLayer.append("circle").attr("class","city-dot").attr("cx",c[0]).attr("cy",c[1]).attr("r",3).on("click",e=>{e.stopPropagation();selectProvince(city.state,city.province)});
        cityLayer.append("text").attr("class","city-label").attr("x",c[0]+6).attr("y",c[1]-6).text(city.name);
    }
}

initUSAMap().catch(err=>{
    const shell=document.getElementById("usa-map-shell");
    if(shell) shell.innerHTML='<div style="padding:20px;color:#e8edf2;font:14px Arial">Map failed to load. Check your internet connection.</div>';
});
