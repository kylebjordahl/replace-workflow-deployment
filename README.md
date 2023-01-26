<p align="center">
  <a href="https://github.com/actions/typescript-action/actions"><img alt="typescript-action status" src="https://github.com/actions/typescript-action/workflows/build-test/badge.svg"></a>
</p>

# Replace Workflow Deployment Action

## The problem

If you use GitHub Actions to deploy in a non-continuous way (i.e. you trigger a deployment workflow manually) and you utilize
GitHub's Deployment Environments feature, you will likely end up that the `ref` associated with the resulting `deployment` object
in GitHub's data model points to the state of `main` at the time your workflow ran, regardless of the ref that was actually deployed
(which is frequently a release tag).

## The solution

This action looks for the most recent release which was created for the SHA which triggered the current workflow, mixes it's data with data that is input to the action, and creates a new deployment with the updated data. The old release is then marked inactive and subsequently deleted, preventing duplication of deployments.

## Example workflow

The workflow below is built to allow manual triggering while providing a release tag and an environment name

```
name: Manually Deploy to Env

on:
  workflow_dispatch:
    inputs:
      # you probably want to validate this input somewhere!
      release_tag:
        description: the tag of the release to deploy
        type: string
        required: true

      environment:
        description: the environment to deploy to
        type: choice
        options:
          - production
        required: true


jobs:
  # Do your deployment as appropriate, setting the environment so that a deployment is created
  do_deploy:
    environment: ${{ inputs.environment  }}
    runs-on: ubuntu-latest
    steps:
      - run: echo "Do deployment of ${{inputs.release_tag}} to ${{ inputs.environment }}"

  # run this action _in a dependent job_ so that it can find the newly created deployment from the previous job
  clean_up_deploy:
    runs-on: ubuntu-latest
    needs: [do_deploy]
    steps:

      # be sure to replace with whatever version you'd like to pin to
      - uses: kylebjordahl/replace-workflow-deployment@v1.0.0
        with:
          ref: ${{inputs.release_tag}}
          description: Deployment of ${{inputs.release_tag}} to ${{ inputs.environment }}
          environment: ${{ inputs.environment }}
          token: ${{ secrets.GITHUB_TOKEN }}
```
