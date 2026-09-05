import { apiBlob, apiDelete, apiGet, apiPost } from './client';

export const projectsApi = {
  list: () => apiGet('/api/projects'),
  get: (projectId) => apiGet(`/api/projects/${projectId}`),
  remove: (projectId) => apiDelete(`/api/projects/${projectId}`),
  upload: (file) => {
    const form = new FormData();
    form.append('file', file);
    return apiPost('/api/projects/upload', form);
  },
  files: (projectId) => apiGet(`/api/projects/${projectId}/files`),
  tree: (projectId) => apiGet(`/api/projects/${projectId}/tree`),
  file: (projectId, fileId) => apiGet(`/api/projects/${projectId}/files/${fileId}`),
  content: (projectId, fileId) => apiGet(`/api/projects/${projectId}/files/${fileId}/content`),
  analyze: (projectId) => apiPost(`/api/projects/${projectId}/analyze`, {}),
  analysis: (projectId) => apiGet(`/api/projects/${projectId}/analysis`),
  issues: (projectId) => apiGet(`/api/projects/${projectId}/issues`),
  diagnose: (projectId, issueId) => apiPost(`/api/projects/${projectId}/issues/${issueId}/diagnose`, {}),
  fix: (projectId, issueId) => apiPost(`/api/projects/${projectId}/issues/${issueId}/fix`, {}),
  applyChange: (projectId, changeId) => apiPost(`/api/projects/${projectId}/changes/${changeId}/apply`, {}),
  rejectChange: (projectId, changeId) => apiPost(`/api/projects/${projectId}/changes/${changeId}/reject`, {}),
  versions: (projectId) => apiGet(`/api/projects/${projectId}/versions`),
  fileVersions: (projectId, fileId) => apiGet(`/api/projects/${projectId}/files/${fileId}/versions`),
  impact: (projectId, fileId, explain = false) =>
    apiGet(`/api/projects/${projectId}/files/${fileId}/impact${explain ? '?explain=true' : ''}`),
  rootCause: (projectId, issueId, explain = true) =>
    apiGet(`/api/projects/${projectId}/issues/${issueId}/root-cause${explain ? '' : '?explain=false'}`),
  security: (projectId) => apiGet(`/api/projects/${projectId}/security`),
  securityFinding: (projectId, findingId, explain = false) =>
    apiGet(`/api/projects/${projectId}/security/${findingId}${explain ? '?explain=true' : ''}`),
  projectChat: (projectId, payload) => apiPost(`/api/projects/${projectId}/ai/chat`, payload),
  fileChat: (projectId, fileId, payload) =>
    apiPost(`/api/projects/${projectId}/files/${fileId}/ai/chat`, payload),
  validate: (projectId, type = 'full') => apiPost(`/api/projects/${projectId}/validate`, { type }),
  validation: (projectId) => apiGet(`/api/projects/${projectId}/validation`),
  validationRun: (projectId, runId) => apiGet(`/api/projects/${projectId}/validation/${runId}`),
  exportProject: (projectId) => apiPost(`/api/projects/${projectId}/export`, {}),
  exports: (projectId) => apiGet(`/api/projects/${projectId}/exports`),
  downloadExport: async (projectId, exportId, filename) => {
    const blob = await apiBlob(`/api/projects/${projectId}/exports/${exportId}/download`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'project-fixed.zip';
    a.click();
    URL.revokeObjectURL(url);
  },
};
