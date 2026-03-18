export interface JobContext {
  now: Date;
}

export interface Job {
  readonly name: string;
  run(context: JobContext): Promise<void>;
}
