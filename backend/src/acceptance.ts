import type {ValidationIssue} from '../../docs/handoff/contracts.js';

/**
 * Visual acceptance policy (default: permissive).
 *
 * Visual rules describe presentation quality, not executability: zone_fit,
 * fit, placement, orientation and clearance. Under the default permissive
 * policy they are recorded as diagnostics and accepted regardless of count
 * — there is no defect-count or severity gate for presentation metadata.
 * Actual participant route and runtime checks are separate.
 * Actual participant routes and executable scene references remain hard.
 * Object-support annotations and requirement bookkeeping are advisory in
 * construction; the approved experience is checked independently.
 *
 * BRAIVE_VISUAL_STRICTNESS=standard restores the stricter historical
 * behavior (severity cap 1, per-category and total budgets) for developer
 * inspection. Users set the threshold deliberately; tests detecting
 * cosmetic defects do not raise it automatically.
 */
export const VISUAL_RULES=new Set(['zone_fit','fit','placement','orientation','clearance']);
export type VisualStrictness='permissive'|'standard';
export function visualStrictness():VisualStrictness {
 return process.env.BRAIVE_VISUAL_STRICTNESS==='standard'?'standard':'permissive';
}
export const ACCEPTANCE_POLICY={
 softSeverityLimit:1,
 categoryBudgets:{zone_fit:3} as Readonly<Record<string,number>>,
 totalSoftSeverity:4,
};

export type ClassifiedIssue=ValidationIssue&{classification?:'hard'|'soft';severity?:number;outdoor?:boolean};

export function zoneSeverity(overflowPerAxis:number[],zoneSize:number[]):number {
 return Math.max(...overflowPerAxis.map((value,axis)=>value/Math.max(0.3,0.05*zoneSize[axis])));
}

/** Consistent classification: equivalent visual checks share one outcome. */
export function classifyVisual(issue:ClassifiedIssue,mode:VisualStrictness=visualStrictness()):ClassifiedIssue {
 if(!VISUAL_RULES.has(issue.rule))return issue;
 // A builder-authored inset or required flag is not a user boundary.
 const severity=issue.severity??1;
 if(mode==='permissive')return {...issue,classification:'soft',severity};
 if(issue.classification==='hard')return issue;
 return {...issue,classification:issue.rule==='zone_fit'&&severity<=ACCEPTANCE_POLICY.softSeverityLimit?'soft':'hard',severity};
}

export function evaluateAcceptance(issues:ClassifiedIssue[],mode:VisualStrictness=visualStrictness()):{acceptedSoft:ClassifiedIssue[];reasons:string[]} {
 const reasons:string[]=[];
 const soft=issues.filter(issue=>issue.classification==='soft');
 if(mode==='permissive'){
  return {acceptedSoft:reasons.length?[]:soft,reasons};
 }
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
