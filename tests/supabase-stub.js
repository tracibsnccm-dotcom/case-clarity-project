(function(){
  function q(table){
    var res={data:null,error:null};
    if(table==='trial_users') res.data={id:'u1',ccp:'CCP-TEST01',email:'tester@example.com',auth_user_id:'u1',trial_start_at:new Date().toISOString(),status:'trial_active'};
    var b={};
    ['select','eq','neq','in','order','limit','update','insert','upsert','delete','match','is','gte','lte','filter'].forEach(function(m){b[m]=function(){return b;};});
    b.single=function(){return Promise.resolve(res);};
    b.maybeSingle=function(){return Promise.resolve(res);};
    b.then=function(r,j){return Promise.resolve({data:Array.isArray(res.data)?res.data:(res.data?[res.data]:[]),error:null}).then(r,j);};
    return b;
  }
  var sess={user:{id:'u1',email:'tester@example.com'},access_token:'x'};
  var client={
    auth:{getSession:function(){return Promise.resolve({data:{session:sess},error:null});},
          getUser:function(){return Promise.resolve({data:{user:sess.user},error:null});},
          onAuthStateChange:function(){return {data:{subscription:{unsubscribe:function(){}}}};},
          signOut:function(){return Promise.resolve({});}},
    from:q,
    rpc:function(name,args){
      if(name==='trial_workspace_save'){ const ts=new Date().toISOString(); sessionStorage.setItem('__stub_ws', JSON.stringify({data:args.p_data, updated_at:ts})); window.__stubSaves=(window.__stubSaves||0)+1; return Promise.resolve({data:ts,error:null}); }
      if(name==='trial_workspace_get'){ const r=sessionStorage.getItem('__stub_ws'); return Promise.resolve({data: r?[JSON.parse(r)]:[], error:null}); }
      return Promise.resolve({data:[],error:null});},
    functions:{invoke:function(){return Promise.resolve({data:null,error:null});}}
  };
  window.supabase={createClient:function(){return client;}};
})();
