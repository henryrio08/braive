/** Paid scene recovery is a developer opt-in, never part of normal preparation. */
export function automaticSceneRepairEnabled():boolean {
 return process.env.BRAIVE_AUTO_SCENE_REPAIR==='true';
}
