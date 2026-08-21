import { beforeEach, describe, expect, it } from 'vitest'
import { executeCommand, getEnvironment, resetEnvironment } from './simulator'

function text(input: string) {
  return executeCommand(input).lines.join('\n')
}

describe('docker simulator regression coverage', () => {
  beforeEach(() => {
    resetEnvironment()
  })

  it('pulls a remote image into the local image list and records command history', () => {
    const output = text('docker pull alpine:3.19')
    const env = getEnvironment()

    expect(output).toContain('Status: Downloaded newer image for alpine:3.19')
    expect(env.images.some((image) => image.full === 'alpine:3.19')).toBe(true)
    expect(env.history).toContain('docker pull alpine:3.19')
  })

  it('runs, lists, stops and removes a named container', () => {
    const runOutput = text('docker run -d --name web -p 8080:80 nginx:latest')
    let env = getEnvironment()

    expect(runOutput).toContain('80/tcp -> 0.0.0.0:8080')
    expect(env.containers).toHaveLength(1)
    expect(env.containers[0]).toMatchObject({
      name: 'web',
      image: 'nginx:latest',
      status: 'running'
    })
    expect(text('docker ps')).toContain('web')

    text('docker stop web')
    env = getEnvironment()
    expect(env.containers[0]).toMatchObject({ name: 'web', status: 'exited' })

    expect(text('docker rm web')).toContain('web')
    expect(getEnvironment().containers).toEqual([])
  })

  it('creates volumes and networks, then reset restores the baseline environment', () => {
    expect(text('docker volume create data')).toContain('data')
    text('docker network create appnet')

    let env = getEnvironment()
    expect(env.volumes.some((volume) => volume.name === 'data')).toBe(true)
    expect(env.networks.some((network) => network.name === 'appnet')).toBe(true)

    resetEnvironment()
    env = getEnvironment()

    expect(env.containers).toEqual([])
    expect(env.volumes).toEqual([])
    expect(env.networks.map((network) => network.name).sort()).toEqual(['bridge', 'host', 'none'])
    expect(env.images.some((image) => image.full === 'alpine:3.19')).toBe(false)
    expect(env.history).toEqual([])
  })
})
