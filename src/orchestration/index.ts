// Orchestration layer for managing distributed services

export interface OrchestrationTask {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
}

export class Orchestrator {
  private tasks: Map<string, OrchestrationTask> = new Map();

  createTask(name: string): string {
    const id = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const task: OrchestrationTask = {
      id,
      name,
      status: 'pending',
      createdAt: new Date(),
    };
    
    this.tasks.set(id, task);
    return id;
  }

  getTask(id: string): OrchestrationTask | undefined {
    return this.tasks.get(id);
  }

  updateTask(id: string, status: OrchestrationTask['status']): void {
    const task = this.tasks.get(id);
    if (task) {
      task.status = status;
      if (status === 'completed' || status === 'failed') {
        task.completedAt = new Date();
      }
    }
  }
}
