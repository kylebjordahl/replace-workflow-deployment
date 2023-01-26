import * as core from '@actions/core'
import * as github from '@actions/github'

import {DateTime} from 'luxon'

async function run(): Promise<void> {
  try {
    const inputs = {
      environment: core.getInput('environment', {required: true}),
      ref: core.getInput('ref', {required: true}),
      description: core.getInput('description', {required: true}),
      token: core.getInput('token', {required: true}),
    }

    const octo = github.getOctokit(inputs.token)

    // get the deployment which was created recently with the same git ref as this run
    const currentRunRef = github.context.ref
    const deployments = await octo.rest.repos.listDeployments({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      ref: currentRunRef,
      environment: inputs.environment,
    })
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

    const newDeploymentResponse = await octo.rest.repos.createDeployment({
      owner: github.context.repo.owner,
      repo: github.context.repo.repo,
      ref: inputs.ref,
      description: inputs.description,
      environment: replacedDeployment.environment,
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
      })

    if (newDeploymentStatusUpdateResponse.status !== 201) {
      throw Error('Failed to set new deployment status')
    }
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}

run()
