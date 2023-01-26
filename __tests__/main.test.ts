import * as process from 'process'
import * as cp from 'child_process'
import * as util from 'util'
import * as path from 'path'
import {expect, test} from '@jest/globals'

test.skip('Live fire test', async () => {
  const tokenCmdOutput = await util.promisify(cp.exec)(`gh auth token`)
  process.env['INPUT_REF'] = `v0.1.1`
  process.env['INPUT_DESCRIPTION'] = 'Live fire test'
  process.env['INPUT_ENVIRONMENT'] = 'production'
  process.env['INPUT_TOKEN'] = tokenCmdOutput.stdout
  process.env['GITHUB_REPOSITORY'] = 'kylebjordahl/replace-workflow-deployment'
  process.env['GITHUB_SHA'] = '89abb3ce6ea66ab5f029ae5a3374ec435aa47f25'

  const np = process.execPath
  const ip = path.join(__dirname, '..', 'lib', 'main.js')
  const options: cp.ExecFileSyncOptions = {
    env: process.env,
  }

  await new Promise<void>(res => {
    cp.execFile(np, [ip], options, (error, stdout) => {
      console.log(stdout)
      res()
    })
  })
})
