import { dateInZone, timeInZone, type Profile, type Task } from '@todo/shared';

const STATUS: Record<Task['status'], string> = {
  new: 'new',
  queued: 'queued',
  in_progress: 'in progress',
  paused: 'paused',
  completed: 'completed',
};

export function formatDue(task: Pick<Task, 'dueAt' | 'dueAllDay'>, timeZone: string): string {
  if (!task.dueAt) return '';
  const at = new Date(task.dueAt);
  return task.dueAllDay ? dateInZone(at, timeZone) : `${dateInZone(at, timeZone)} ${timeInZone(at, timeZone)}`;
}

export function formatTask(task: Task, timeZone: string, now: Date = new Date()): string {
  const due = formatDue(task, timeZone);
  const overdue = task.dueAt && task.status !== 'completed' && new Date(task.dueAt) < now ? ', overdue' : '';
  return `#${task.number}  [${STATUS[task.status]}]  ${task.title}${due ? `  (due ${due}${overdue})` : ''}`;
}

export function formatTaskDetail(task: Task, timeZone: string, now: Date = new Date()): string[] {
  return [formatTask(task, timeZone, now), ...(task.notes ? [`    ${task.notes}`] : [])];
}

export function formatProfile(profile: Profile): string[] {
  return [
    `Name:       ${profile.displayName}`,
    `Email:      ${profile.email}`,
    `Timezone:   ${profile.timezone}`,
    `Page size:  ${profile.pageSize}`,
  ];
}
