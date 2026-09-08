(() => {
 const el=document.querySelector('main');
 let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber'))];
 while(f && f.type?.name!=='App') f=f.return;
 window.__app=f;
 let h=f.memoizedState;
 while(h){
   if(h.memoizedState?.current?.constructor?.name==='RideStation3D') window.__station=h.memoizedState.current;
   if(h.memoizedState?.zenMode!==undefined) h.queue.dispatch({...h.memoizedState,zenMode:true});
   h=h.next;
 }
 __station.setZenMode(true);
 const restart=[...document.querySelectorAll('button')].find(b=>/new shift|restart|play again/i.test(b.textContent));
 restart?.click();
 return {tracks:Object.keys(__station.tracks),npcs:__station.npcMeshes.size};
})()
