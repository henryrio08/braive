import type {SessionPlan,ToolCall} from '../../docs/handoff/contracts.js';
import {AppError} from './contracts.js';

/** Bounded application dispatcher. Models may select registered tools and typed
 * arguments; they cannot introduce handlers or change execution phases. */
export function plannedTool(plan:SessionPlan,tool:ToolCall['tool'],phase:ToolCall['execute_when']):ToolCall {
 const calls=plan.tool_calls.filter(call=>call.tool===tool&&call.execute_when===phase);
 if(calls.length!==1)throw new AppError('INVALID_MODEL_OUTPUT',`Expected exactly one ${tool} tool in ${phase}`,[{path:'/tool_calls',rule:'tool_schedule',message:`Declare exactly one ${tool} in ${phase}`}]);
 return calls[0];
}
export async function dispatchTool<T>(plan:SessionPlan,tool:ToolCall['tool'],phase:ToolCall['execute_when'],handler:(args:ToolCall['arguments'])=>Promise<T>):Promise<T> {
 return handler(plannedTool(plan,tool,phase).arguments);
}
