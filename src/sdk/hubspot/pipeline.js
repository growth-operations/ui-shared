// HubSpot pipeline + stage fetchers and a stage-diffing helper.
//
// Goes through callHubSpotApi → hubspot.fetch rules apply.
//
// Generalization note: the source hardcoded the pipeline object type as
// `a${context.extension.appId}_application` (an app-specific custom object).
// Here the object type is a parameter that DEFAULTS to that convention, so
// existing apps keep working while others can pass their own object type.
import { buildHubSpotUrl, callHubSpotApi } from "./base";

// Default pipeline object type: the app's "<app>_application" custom object,
// derived from context.extension.appId (the historical convention).
function defaultPipelineObjectType(context) {
  return `a${context.extension.appId}_application`;
}

export async function getPipelines(context, token, objectType = defaultPipelineObjectType(context)) {
  const url = buildHubSpotUrl(`crm/v3/pipelines/${objectType}`);
  return callHubSpotApi(url, token);
}

export async function getPipelineStages(
  context,
  token,
  pipelineId,
  objectType = defaultPipelineObjectType(context)
) {
  const url = buildHubSpotUrl(`crm/v3/pipelines/${objectType}/${pipelineId}/stages`);
  return callHubSpotApi(url, token);
}

// Diff the app's stored stages against HubSpot's current pipeline stages and
// describe the changes (init / update / null when nothing changed).
//
// `makeNewStage` builds the record for a stage that exists in HubSpot but not in
// the app's stored config. It defaults to { stage_id, name } only; apps that
// attach extra per-stage data (e.g. a children array) can pass their own factory.
export function computeStageChanges(
  currentStages,
  newPipelineStages,
  makeNewStage = (stage) => ({ stage_id: stage.id, name: stage.label })
) {
  if (!currentStages) {
    return {
      type: "init",
      changes: newPipelineStages.map(makeNewStage),
    };
  }

  const existingStagesMap = new Map(
    currentStages.map((stage) => [stage.stage_id, stage])
  );
  const pipelineStagesMap = new Map(
    newPipelineStages.map((stage) => [stage.id, stage])
  );

  const stagesToRemove = currentStages.filter(
    (stage) => !pipelineStagesMap.has(stage.stage_id)
  );

  const stagesToAdd = [];
  const stagesToUpdate = [];
  let hasChanges = false;

  newPipelineStages.forEach((pipelineStage) => {
    const existingStage = existingStagesMap.get(pipelineStage.id);

    if (existingStage) {
      if (existingStage.name !== pipelineStage.label) {
        stagesToUpdate.push({
          ...existingStage,
          name: pipelineStage.label,
          oldName: existingStage.name,
        });
        hasChanges = true;
      }
    } else {
      stagesToAdd.push(makeNewStage(pipelineStage));
      hasChanges = true;
    }
  });

  if (stagesToRemove.length > 0 || hasChanges) {
    return {
      type: "update",
      stagesToRemove,
      stagesToAdd,
      stagesToUpdate,
      finalStages: newPipelineStages.map((pipelineStage) => {
        const existingStage = existingStagesMap.get(pipelineStage.id);
        if (existingStage) {
          return {
            ...existingStage,
            name: pipelineStage.label,
          };
        }
        return makeNewStage(pipelineStage);
      }),
    };
  }

  return null;
}
