export type SaveStatus = "saved" | "pending" | "saving" | "conflict" | "error";
/** Serializes writes; a delayed response never replaces edits made while saving. */
export class Autosave<T> {
  status: SaveStatus = "saved";
  private timer?: ReturnType<typeof setTimeout>;
  private pending?: T;
  private running?: Promise<void>;
  private firstEdit = 0;
  private disposed = false;
  constructor(public version: number, private write: (value:T,version:number)=>Promise<{version:number}>, private notify: (status:SaveStatus)=>void) {}
  private set(status:SaveStatus) { this.status=status; if (!this.disposed) this.notify(status); }
  edit(value:T) {
    this.pending=value;
    if (["conflict","error"].includes(this.status)) return;
    this.firstEdit ||= Date.now();
    if (!this.running) this.set("pending");
    clearTimeout(this.timer);
    this.timer=setTimeout(()=>void this.flush(), Math.max(0,Math.min(700,2000-(Date.now()-this.firstEdit))));
  }
  async flush():Promise<void> {
    clearTimeout(this.timer);
    if (this.running) { await this.running; if (this.pending && !["conflict","error"].includes(this.status)) await this.flush(); return; }
    if (!this.pending || this.disposed || this.status === "conflict") return;
    const value=this.pending; this.pending=undefined; this.firstEdit=0; this.set("saving");
    this.running=(async()=>{
      try { const saved=await this.write(value,this.version); this.version=saved.version; this.set(this.pending ? "pending":"saved"); }
      catch(error) { this.pending ??= value; this.set((error as {status?:number}).status===409 ? "conflict":"error"); }
    })();
    await this.running; this.running=undefined;
    if (this.pending && this.status === "pending") this.timer=setTimeout(()=>void this.flush(),700);
  }
  externalVersion(version:number) { if (this.status === "saved" && version !== this.version) this.set("conflict"); }
  dispose() { this.disposed=true; clearTimeout(this.timer); }
}
