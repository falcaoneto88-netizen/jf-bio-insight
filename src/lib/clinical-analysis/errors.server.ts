// Only authored messages may cross the server boundary. Never wrap provider/DB errors here.
export class AnalysisMessageError extends Error {}
