type Fn = (...a: any[]) => void;
export class Emitter {
  private m = new Map<string, Fn[]>();
  on(e: string, f: Fn) { (this.m.get(e) ?? this.m.set(e, []).get(e)!).push(f); }
  emit(e: string, ...a: any[]) { this.m.get(e)?.forEach((f) => f(...a)); }
}
