function tg(){var r=document.documentElement,d=r.getAttribute("data-theme");if(!d)d=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";r.setAttribute("data-theme",d==="dark"?"light":"dark")}
(function(){
  var toast=document.getElementById('toast'),tt;
  function say(m){if(!toast)return;toast.textContent=m;toast.classList.add('on');clearTimeout(tt);tt=setTimeout(function(){toast.classList.remove('on')},1400)}
  document.addEventListener('click',function(e){
    var b=e.target.closest('[data-act]');
    if(b){
      var a=b.getAttribute('data-act'),row=b.closest('.li,.wi,.ev,.prow');
      if(a==='touch'){b.textContent='Logged today';b.classList.add('ok');say('Touch logged')}
      else if(a==='done'){if(row){row.classList.add('done')}b.classList.add('ok');say('Done')}
      else if(a==='snooze'){if(row){row.classList.add('snz');row.style.display='none'}say('Snoozed to tomorrow')}
      else if(a==='start'){if(row){row.classList.add('going')}b.textContent='Started';say('Started, timer on')}
      else{say('Sample only')}
      return;
    }
    var f=e.target.closest('[data-filter]');
    if(f){var v=f.getAttribute('data-filter');document.querySelectorAll('[data-filter]').forEach(function(x){x.classList.toggle('on',x===f)});
      document.querySelectorAll('#plist .prow[data-stage]').forEach(function(r){r.style.display=(v==='All'||r.getAttribute('data-stage')===v)?'':'none'})}
    var g=e.target.closest('[data-evf]');
    if(g){var k=g.getAttribute('data-evf');document.querySelectorAll('[data-evf]').forEach(function(x){x.classList.toggle('on',x===g)});
      document.querySelectorAll('.ev').forEach(function(r){r.closest('.card').style.display=(k==='all'||r.getAttribute('data-type')===k)?'':'none'})}
    var s=e.target.closest('#focusbtn');
    if(s){document.body.classList.toggle('focus');s.setAttribute('aria-pressed',document.body.classList.contains('focus'))}
  });
})();
