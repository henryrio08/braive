/** One shared correction is allowed inside the original deadline and budget.
 * Developers can explicitly disable it for zero-repair diagnostics. */
export function automaticSceneRepairEnabled():boolean {
 return process.env.BRAIVE_AUTO_SCENE_REPAIR!=='false';
}
