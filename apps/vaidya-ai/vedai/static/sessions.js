// Browser-only history. Transactions update one session at a time, including
// across tabs; no history is exposed through the public server.
class SessionStore {
  constructor(onUnavailable) { this.db=null;this.memory=new Map();this.onUnavailable=onUnavailable; }
  unavailable() { this.db?.close();this.db=null;this.onUnavailable(); }
  async open() {
    try {
      this.db=await new Promise((resolve,reject)=>{
        const request=indexedDB.open('vedai-sessions',1);
        request.onupgradeneeded=()=>request.result.createObjectStore('sessions',{keyPath:'id'});
        request.onsuccess=()=>resolve(request.result);
        request.onerror=()=>reject(request.error);
        request.onblocked=()=>reject(new Error('History storage is blocked'));
      });
      this.db.onversionchange=()=>this.unavailable();
    } catch { this.unavailable(); }
    return this.all();
  }
  async all() {
    if(this.db) {
      try {
        const rows=await new Promise((resolve,reject)=>{
          const tx=this.db.transaction('sessions','readonly');
          const request=tx.objectStore('sessions').getAll();
          tx.oncomplete=()=>resolve(request.result);tx.onabort=()=>reject(tx.error);
        });
        this.memory=new Map(rows.map(row=>[row.id,row]));
      } catch { this.unavailable(); }
    }
    return [...this.memory.values()].sort((a,b)=>b.updated-a.updated);
  }
  async change(id, update) {
    let result;
    if(this.db) {
      try {
        result=await new Promise((resolve,reject)=>{
          const tx=this.db.transaction('sessions','readwrite'),store=tx.objectStore('sessions');
          const request=store.get(id);let next;
          request.onsuccess=()=>{
            next=update(request.result);
            if(next)store.put(next);else store.delete(id);
          };
          tx.oncomplete=()=>resolve(next);tx.onabort=()=>reject(tx.error);
        });
      } catch { this.unavailable();result=update(structuredClone(this.memory.get(id))); }
    } else result=update(structuredClone(this.memory.get(id)));
    if(result)this.memory.set(id,result);else this.memory.delete(id);
    return result;
  }
}
window.SessionStore=SessionStore;
