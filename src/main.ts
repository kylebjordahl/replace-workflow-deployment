import * as core from '@actions/core'
import * as github from '@actions/github'

import {DateTime} from 'luxon'

export async function run(): Promise<void> {
  try {
    const inputs = {
      environment: core.getInput('environment', {required: true}),
      ref: core.getInput('ref', {required: true}),
      description: core.getInput('description', {required: true}),
      token: core.getInput('token', {required: true}),
    }

    const octo = github.getOctokit(inputs.token)

    // get the deployment which was created recently with the same git ref as this run
    const deployments = await octo.rest.repos.listDeployments({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      sha: github.context.sha,
      environment: inputs.environment,
    })

    core.debug(`Fetched ${deployments.data.length} deployments`)

    deployments.data.forEach(d =>
      core.debug(
        `Found deployment [${d.id}(${d.updated_at}): ${d.description}]`,
      ),
    )

    // const deploymentsToReplace = deployments.data.filter(
    //   d =>
    //     // only ones from github actions
    //     d.performed_via_github_app?.slug === 'github-actions',
    // )
    const replacedDeployment = deployments.data.slice(0, 1).shift()

    if (!replacedDeployment) {
      throw Error('Could not find a deployment to replace')
    }

    const replacedDeploymentStatusesResult =
      await octo.rest.repos.listDeploymentStatuses({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        deployment_id: replacedDeployment.id,
      })

    const replacedDeploymentStatuses = replacedDeploymentStatusesResult.data

    replacedDeploymentStatuses.sort((a, b) =>
      DateTime.fromISO(b.updated_at)
        .diff(DateTime.fromISO(a.updated_at))
        .toMillis(),
    )

    const latestReplacedDeploymentStatus = replacedDeploymentStatuses.shift()

    core.info(
      `Replacing deployment ${replacedDeployment.id}: ${replacedDeployment.description}`,
    )

    // create a new deployment for the target environment

    // https://github.com/kylebjordahl/replace-workflow-deployment/actions/runs/4012266800/jobs/6890573893
    const workflowUrl = `${github.context.serverUrl}/${github.context.repo.owner}/${github.context.repo.repo}/runs/${github.context.runId}`

    const newDeploymentResponse = await octo.rest.repos.createDeployment({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      ref: inputs.ref,
      description: inputs.description,
      environment: replacedDeployment.environment,
      auto_merge: false,
      // because we are replacing an existing deployment, we don't care about status checks
      required_contexts: [],
    })

    if (newDeploymentResponse.status !== 201) {
      core.debug(
        `Create new deployment returned ${newDeploymentResponse.status}: ${newDeploymentResponse.data}`,
      )
      throw Error('Failed to create a new deployment')
    }

    const newDeployment = newDeploymentResponse.data

    core.setOutput('deployment_id', newDeployment.id)

    const newDeploymentStatusUpdateResponse =
      await octo.rest.repos.createDeploymentStatus({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        deployment_id: newDeployment.id,
        state: latestReplacedDeploymentStatus?.state ?? 'success',
        log_url: workflowUrl,
        description: inputs.description,
        auto_inactive: true,
      })

    if (newDeploymentStatusUpdateResponse.status !== 201) {
      throw Error('Failed to set new deployment status')
    }

    const replacedDeploymentStatusUpdateResponse =
      await octo.rest.repos.createDeploymentStatus({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        deployment_id: replacedDeployment.id,
        state: 'inactive',
      })

    if (replacedDeploymentStatusUpdateResponse.status !== 201) {
      throw Error('Failed to set replaced deployment status')
    }

    const deleteOldDeploymentResult = await octo.rest.repos.deleteDeployment({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      deployment_id: replacedDeployment.id,
    })

    if (deleteOldDeploymentResult.status !== 204) {
      throw Error(`Failed to delete old deployment [${replacedDeployment.id}]`)
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

switch (process.argv[2]) {
  case '--post': {
    run()
    break
  }
  default:
    run()
}
