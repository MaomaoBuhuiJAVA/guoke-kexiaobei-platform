(() => {
  'use strict';
  const { css, color, lerp } = ColorModel;
  const white = [255,255,255], dark = [26,51,65];
  const tau = 2 * Math.PI;
  function ellipse(c,x,y,rx,ry,fill) {
    if (rx <= 0 || ry <= 0) return;
    c.beginPath(); c.ellipse(x,y,rx,ry,0,0,tau); c.fillStyle=fill; c.fill();
  }
  function backdrop(c,w,h,spots,s,clock) {
    const grd=c.createLinearGradient(0,0,0,h);
    grd.addColorStop(0,'#edf7ee'); grd.addColorStop(.73,'#e6f0e5'); grd.addColorStop(1,'#dbeadd');
    c.fillStyle=grd; c.fillRect(0,0,w,h);
    c.strokeStyle='#76a98518'; c.lineWidth=1; c.beginPath();
    for(let x=(w%24)/2;x<w;x+=24){c.moveTo(x,0);c.lineTo(x,h);}
    for(let y=11;y<h;y+=24){c.moveTo(0,y);c.lineTo(w,y);}
    c.stroke();
    c.strokeStyle='#63957842'; c.lineWidth=1; c.strokeRect(11.5,11.5,w-23,h-23);
    c.beginPath();
    for(let i=24;i<w-16;i+=12){c.moveTo(i,h-12);c.lineTo(i,h-(i%48===0?23:17));}
    c.stroke();
    ice(c,29,31,7); ice(c,w-29,31,7);
    for(const p of spots){
      c.save(); c.translate(p.x,p.y + s.h*.48); c.strokeStyle='#4f8f7340'; c.setLineDash([3,4]); c.beginPath(); c.ellipse(0,0,s.w*.44,8,0,0,tau); c.stroke(); c.restore();
    }
    if(w>510){
      c.save();c.translate(w*.51,102);c.rotate(-.19);c.strokeStyle='#75a88b39';c.lineWidth=1.4;
      c.beginPath();c.ellipse(0,0,60,28,0,0,tau);c.stroke();c.rotate(.39);c.beginPath();c.ellipse(0,0,60,28,0,0,tau);c.stroke();c.rotate(.8);c.beginPath();c.ellipse(0,0,48,29,0,0,tau);c.stroke();
      ellipse(c,0,0,3.5,3.5,'#6e9f8054'); ellipse(c,44*Math.cos(clock*.5),23*Math.sin(clock*.5),2.8,2.8,'#74ae90a0'); c.restore();
    }
  }
  function ice(c,x,y,r){c.beginPath();c.moveTo(x-r,y);c.lineTo(x+r,y);c.moveTo(x,y-r);c.lineTo(x,y+r);c.stroke();}
  function glassPath(c){
    c.beginPath(); c.moveTo(-.47,-.39); c.bezierCurveTo(-.465,-.17,-.385,.29,-.343,.393); c.bezierCurveTo(-.31,.51,.30,.51,.343,.393);
    c.bezierCurveTo(.385,.29,.465,-.17,.47,-.39); c.bezierCurveTo(.47,-.56,-.47,-.56,-.47,-.39); c.closePath();
  }
  function liquid(c,o){
    const {level, rgb, wave, tilt, clock, mixing} = o;
    const f=level/100;
    const row=lerp(.44,-.34,f), slope=Math.sin(tilt)*Math.min(.29,f*.85), a=Math.min(.045,f*.13), ripple=wave*.069;
    const waveAt=x=>row + slope*x*2 + Math.sin(clock*4.3+x*9)*a*.32 + Math.sin(clock*6+x*4)*ripple;
    c.save(); c.beginPath();c.moveTo(-.58,waveAt(-.58));for(let x=-.57;x<=.59;x+=.025)c.lineTo(x,waveAt(x));
    c.lineTo(.6,.53);c.lineTo(-.6,.53);c.closePath();c.clip();
    const g=c.createLinearGradient(-.25,row,.23,.47);
    g.addColorStop(0,css(color(rgb, white,.31),.92));g.addColorStop(.49,css(rgb,.91));g.addColorStop(1,css(color(rgb,dark,.19),.96));
    c.fillStyle=g;c.fillRect(-.55,-.56,1.1,1.11);
    if(mixing){
      const {incoming,original,progress,direction,hit}=mixing;
      const t=progress, fade=1-t;
      c.save();c.globalAlpha=fade*.82;
      const lower=c.createLinearGradient(0,row,0,.48);lower.addColorStop(0,css(original,0));lower.addColorStop(.65,css(original,.7));lower.addColorStop(1,css(original,.92));
      c.fillStyle=lower;c.fillRect(-.53,row,1.06,1);
      for(let j=0;j<6;j++){
        const y=row+(j/6)*(.47-row)*Math.min(1,.24+hit+t*.8), x=direction*(.15-j*.038)+Math.sin(j*1.48+clock*8)*(.037+t*.16);
        c.save();c.translate(x,y);c.scale(.10+t*.29, .065+t*.10);
        const cloud=c.createRadialGradient(0,0,0,0,0,1);cloud.addColorStop(0,css(incoming,.96));cloud.addColorStop(.52,css(incoming,.72));cloud.addColorStop(1,css(incoming,0));ellipse(c,0,0,1,1,cloud);c.restore();
      }c.restore();
    }
    for(let j=0;j<7;j++){
      const depth=.44-row, x=Math.sin(j*3.67+clock*.67)*.27;
      const y=.43-((clock*(.22+j*.018)+j*.39)%1)*depth;
      const r=(j%3+1)*.010;
      ellipse(c,x,y,r,r*.68,'#ffffff45');ellipse(c,x-r*.2,y-r*.18,r*.38,r*.27,'#ffffffaa');
    }
    c.restore();
    c.beginPath();for(let x=-.49;x<=.51;x+=.025){const y=waveAt(x);if(x===-.49)c.moveTo(x,y);else c.lineTo(x,y);}
    c.strokeStyle=css(color(rgb,white,.52),.83);c.lineWidth=.015;c.stroke();
  }
  function cup(c,o){
    const {x,y,w,h,tilt,level,highlight,raised,glow}=o;
    c.save(); c.translate(x,y);
    if(highlight||glow){
      c.save();c.strokeStyle=glow?css(o.rgb,.32+glow*.55):'#238063a1';c.lineWidth=2;c.setLineDash(highlight?[5,4]:[]);c.beginPath();c.ellipse(0,h*.475,w*(.55+glow*.17),9+glow*8,0,0,tau);c.stroke();c.restore();
    }
    ellipse(c,3,h*.446+(raised?9:0),w*.465,raised?7:9,raised?'#365d471f':'#345b432b');
    c.rotate(tilt);c.scale(w,h);
    glassPath(c);c.save();c.clip();
    let g=c.createLinearGradient(-.47,-.46,.47,.46);
    g.addColorStop(0,'#ffffffec');g.addColorStop(.22,'#ffffff81');g.addColorStop(.52,'#ffffff29');g.addColorStop(.88,'#e7fcf470');g.addColorStop(1,'#779f9455');
    c.fillStyle=g;c.fillRect(-.5,-.57,1,1.1);
    ellipse(c,0,.405,.327,.049,'#48947c33');
    if(level>.05)liquid(c,o);
    c.lineWidth=.026;c.lineCap='round';c.strokeStyle='#ffffffcb';c.beginPath();c.moveTo(-.36,-.265);c.quadraticCurveTo(-.32,.042,-.265,.27);c.stroke();
    c.strokeStyle='#ffffff91';c.lineWidth=.015;c.beginPath();c.moveTo(-.295,.34);c.quadraticCurveTo(-.18,.44,.135,.411);c.stroke();
    for(let i=0;i<4;i++){
      const iy=-.245+i*.136, ix=.343-i*.022;c.strokeStyle=level>40?'#ffffff9c':'#68998591';c.lineWidth=.013;
      c.beginPath();c.moveTo(ix-(i%2===0?.097:.057),iy+.006);c.lineTo(ix,iy);c.stroke();
    }
    c.restore();
    glassPath(c);c.lineWidth=.016;c.strokeStyle='#426b5cbb';c.stroke();
    c.beginPath();c.ellipse(0,-.412,.469,.079,0,0,tau);c.lineWidth=.017;c.strokeStyle='#527f70b5';c.stroke();
    c.beginPath();c.ellipse(0,-.412,.456,.070,0,.13,Math.PI-.13);c.lineWidth=.018;c.strokeStyle='#ffffffce';c.stroke();
    c.restore();
  }
  function stream(c,start,end,rgb,t,clock){
    const dx=end.x-start.x, dy=end.y-start.y;
    const g=c.createLinearGradient(start.x,start.y,end.x,end.y);
    g.addColorStop(0,css(color(rgb,white,.28),.93));g.addColorStop(1,css(rgb,.91));
    const draw=(extra=0)=>{c.beginPath();c.moveTo(start.x+extra,start.y);c.quadraticCurveTo(start.x+dx*.73+extra,start.y+dy*.29,end.x+extra,end.y);};
    c.save(); c.lineCap='round'; c.strokeStyle=g; c.lineWidth=4+Math.sin(t*Math.PI)*4;draw();c.stroke();
    c.strokeStyle='#ffffffb6'; c.lineWidth=1.1;c.setLineDash([6,10]);c.lineDashOffset=-clock*75;draw(-1.3);c.stroke();c.restore();
    for(let j=0;j<8;j++){
      const u=(clock*3.8+j*.127)%1;const side=j%2?-1:1;
      ellipse(c,end.x+side*(5+u*(17+j)),end.y-u*(1-u)*(57+j*4),Math.max(.5,2.5*(1-u)),Math.max(.5,3.3*(1-u)),css(rgb,.68*(1-u)));
    }
  }
  function sparkle(c,x,y,rgb,t){
    c.save(); c.globalAlpha=1-t;
    for(let i=0;i<13;i++){
      const a=i*2.399, d=12+t*(38+i*1.6), px=x+Math.cos(a)*d, py=y+Math.sin(a)*d+t*14;
      c.fillStyle=css(i%3?rgb:[218,153,45]);const size=2+(i%3);
      if(i%3===0){c.strokeStyle=c.fillStyle;c.lineWidth=1.6;ice(c,px,py,size+1);}else ellipse(c,px,py,size*.60,size*.60,c.fillStyle);
    }c.restore();
  }
  window.PaintLab={backdrop,cup,stream,sparkle};
})();
