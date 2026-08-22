import { beforeEach, describe, expect, it, vi } from 'vitest'
import { executeCommand, getEnvironment, loadDockerState, resetEnvironment, saveDockerState } from './simulator'

const storageValues = new Map<string, string>()
const workspaceId = 'docker-playground'
const storageKey = `docker-sim-state-v1-${workspaceId}`

function stubLocalStorage() {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storageValues.get(key) ?? null,
    setItem: (key: string, value: string) => storageValues.set(key, value),
    removeItem: (key: string) => storageValues.delete(key)
  })
}

function text(input: string) {
  return executeCommand(input).lines.join('\n')
}

describe('docker simulator regression coverage', () => {
  beforeEach(() => {
    resetEnvironment()
    storageValues.clear()
    stubLocalStorage()
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

  it('saves Docker state with a schema version wrapper', () => {
    text('docker pull alpine:3.19')
    text('docker volume create data')

    expect(saveDockerState(workspaceId)).toBe(true)

    const saved = JSON.parse(storageValues.get(storageKey)!)
    expect(saved.schemaVersion).toBe(1)
    expect(saved.state.images['alpine:3.19']).toMatchObject({ repo: 'alpine', tag: '3.19' })
    expect(saved.state.volumes).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'data' })]))
  })

  it('loads legacy unversioned Docker state through the v0 migration', () => {
    storageValues.set(
      storageKey,
      JSON.stringify({
        images: {
          'alpine:3.19': {
            repo: 'alpine',
            tag: '3.19',
            id: 'sha256:legacy',
            size: '7MB',
            created: 'just now',
            status: '已下载'
          }
        },
        containers: [{ name: 'legacy', image: 'alpine:3.19', status: 'exited', shortId: 'abc123' }],
        volumes: [{ name: 'legacy-data', driver: 'local', mountpoint: '/var/lib/docker/volumes/legacy-data/_data' }],
        networks: [{ name: 'legacy-net', driver: 'bridge', scope: 'local' }],
        counters: { container: 7, image: 0, network: 2, volume: 3, ports: 4010 }
      })
    )

    expect(loadDockerState(workspaceId)).toBe(true)

    const env = getEnvironment()
    expect(env.images.some((image) => image.full === 'alpine:3.19')).toBe(true)
    expect(env.containers).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'legacy' })]))
    expect(env.volumes).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'legacy-data' })]))
    expect(env.networks).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'legacy-net' })]))
  })

  it('keeps current Docker state when cached JSON is invalid', () => {
    text('docker volume create keep')
    storageValues.set(storageKey, '{broken')

    expect(loadDockerState(workspaceId)).toBe(false)
    expect(getEnvironment().volumes).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'keep' })]))
  })

  it('rejects unsupported Docker state schema versions', () => {
    text('docker volume create keep')
    storageValues.set(
      storageKey,
      JSON.stringify({
        schemaVersion: 999,
        state: { volumes: [{ name: 'future', driver: 'local' }] }
      })
    )

    expect(loadDockerState(workspaceId)).toBe(false)
    expect(getEnvironment().volumes).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'keep' })]))
  })
})
