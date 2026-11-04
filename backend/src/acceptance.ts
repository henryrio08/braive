import type {ValidationIssue} from '../../docs/handoff/contracts.js';

/**
 * Deterministic acceptance policy for tolerable defects.
 *
 * Validators classify; this policy decides. A defect is soft only when its
 * rule is soft-eligible and its normalized severity is at most 1 (overflow
 * measured against the larger of 0.3 m or 5% of the containing dimension, so
 * the allowance scales with the space instead of one universal distance).
 * Acceptance additionally requires per-category count budgets and a total
 * severity budget, so many small defects — or decorative dilution — cannot
 * accumulate into a broken scene, and any individually severe defect stays
 * hard regardless of how much valid content surrounds it.
 */
export const ACCEPTANCE_POLICY={
 softSeverityLimit:1,
 categoryBudgets:{zone_fit:3} as Readonly<Record<string,number>>,
 totalSoftSeverity:4,
};

export type ClassifiedIssue=ValidationIssue&{classification?:'hard'|'soft';severity?:number};

export function zoneSeverity(overflowPerAxis:number[],zoneSize:number[]):number {
 return Math.max(...overflowPerAxis.map((value,axis)=>value/Math.max(0.3,0.05*zoneSize[axis])));
}

export function evaluateAcceptance(issues:ClassifiedIssue[]):{acceptedSoft:ClassifiedIssue[];reasons:string[]} {
 const reasons:string[]=[];
 const soft=issues.filter(issue=>issue.classification==='soft');
 for(const issue of soft){
  if((issue.severity??0)>ACCEPTANCE_POLICY.softSeverityLimit)reasons.push(`${issue.rule} at ${issue.path} exceeds the individual severity limit (${issue.severity?.toFixed(2)} > ${ACCEPTANCE_POLICY.softSeverityLimit})`);
 }
 const counts=new Map<string,number>();
 for(const issue of soft)counts.set(issue.rule,(counts.get(issue.rule)??0)+1);
 for(const [rule,count] of counts){
  const budget=ACCEPTANCE_POLICY.categoryBudgets[rule];
  if(budget!==undefined&&count>budget)reasons.push(`${rule} soft defects (${count}) exceed the category budget (${budget})`);
 }
 const total=soft.reduce((sum,issue)=>sum+(issue.severity??0),0);
 if(total>ACCEPTANCE_POLICY.totalSoftSeverity)reasons.push(`Total soft severity ${total.toFixed(2)} exceeds the acceptance budget (${ACCEPTANCE_POLICY.totalSoftSeverity})`);
 return {acceptedSoft:reasons.length?[]:soft,reasons};
}
