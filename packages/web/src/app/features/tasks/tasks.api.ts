import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { CreateTaskBody, Task, TaskPage, TaskStatus, UpdateTaskBody } from '@todo/shared';
import { Observable } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class TasksApi {
  private readonly http = inject(HttpClient);

  list(options: { limit: number; status?: TaskStatus | ''; cursor?: string | null }): Observable<TaskPage> {
    let params = new HttpParams().set('limit', options.limit);
    if (options.status) params = params.set('status', options.status);
    if (options.cursor) params = params.set('cursor', options.cursor);
    return this.http.get<TaskPage>('/api/v1/tasks', { params });
  }

  create(body: CreateTaskBody): Observable<Task> {
    return this.http.post<Task>('/api/v1/tasks', body);
  }

  update(id: string, body: UpdateTaskBody): Observable<Task> {
    return this.http.patch<Task>(`/api/v1/tasks/${id}`, body);
  }

  trash(id: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/tasks/${id}`);
  }

  listTrash(options: { limit: number; cursor?: string | null }): Observable<TaskPage> {
    let params = new HttpParams().set('limit', options.limit);
    if (options.cursor) params = params.set('cursor', options.cursor);
    return this.http.get<TaskPage>('/api/v1/trash', { params });
  }

  restore(id: string): Observable<Task> {
    return this.http.post<Task>(`/api/v1/tasks/${id}/restore`, {});
  }

  purge(id: string): Observable<void> {
    return this.http.delete<void>(`/api/v1/tasks/${id}`, { params: { permanent: 'true' } });
  }

  emptyTrash(): Observable<{ deleted: number }> {
    return this.http.delete<{ deleted: number }>('/api/v1/trash');
  }
}
