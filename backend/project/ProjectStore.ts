import type { Project } from './project';

let currentProject: Project | null = null;

export type ProjectStore = {
  getProject: () => Project | null;
  createProject: (project: Project) => Project;
};

export const projectStore: ProjectStore = {
  getProject() {
    return currentProject;
  },

  createProject(project: Project) {
    if (currentProject) {
      throw new Error('Project already exists');
    }
    currentProject = project;
    return currentProject;
  },
};
