export function writesEnabled(): boolean {
  return process.env.BINDER_CONFIRM === '1'
}
