// A value that survives JSON.stringify/parse unchanged: the type of jsonb
// columns, so server functions can return them safely
export type Json =
	| string
	| number
	| boolean
	| null
	| Json[]
	| { [key: string]: Json };
