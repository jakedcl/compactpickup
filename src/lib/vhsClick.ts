/** Short mechanical tick. The AudioContext is created only after a user gesture. */
export function createVhsClick() {
  let ctx: AudioContext | null = null

  return {
    arm() {
      if (typeof window === 'undefined') return
      if (!ctx) ctx = new AudioContext()
      void ctx.resume()
    },
    blip() {
      if (!ctx || ctx.state !== 'running') return
      const now = ctx.currentTime
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.setValueAtTime(160, now)
      osc.frequency.exponentialRampToValueAtTime(70, now + 0.04)
      gain.gain.setValueAtTime(0.03, now)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(now)
      osc.stop(now + 0.05)
    },
  }
}
