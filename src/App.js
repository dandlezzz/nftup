import { useEffect, useState } from 'react'
import { FilePicker } from './FilePicker.js'
import { UploadProgress } from './UploadProgress.js'
import { Reporter } from './Reporter.js'
import { ErrorMessage } from './ErrorMessage.js'
import { TokenForm } from './TokenForm.js'
const { ipcRenderer } = window.require('electron')

const STAGE_PICKING = 'picking'
const STAGE_AUTHENTICATING = 'authenticating'
const STAGE_UPLOADING = 'uploading'
const STAGE_ERRORING = 'erroring'
const STAGE_REPORTING = 'reporting'


export function App () {
  const [stage, setStage] = useState(STAGE_PICKING)
  const [dirPaths, setdirPaths] = useState([])
  const [statusText, setStatusText] = useState('')
  const [storedBytes, setStoredBytes] = useState(0)
  const [manifestPath, setManifestPath] = useState('')
  const [storedChunks, setStoredChunks] = useState(0)
  const [totalBytes, setTotalBytes] = useState(0)
  const [totalFiles, setTotalFiles] = useState(0)
  const [cid, setCid] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const handleUploadProgress = async (_, progress) => {
      if (progress.error != null) {
        setError(progress.error)
        setStage(STAGE_ERRORING)
        return
      }
      if (progress.statusText != null) setStatusText(progress.statusText)
      if (progress.storedBytes != null) setStoredBytes(progress.storedBytes)
      if (progress.storedChunks != null) setStoredChunks(progress.storedChunks)
      if (progress.totalBytes != null) setTotalBytes(progress.totalBytes)
      if (progress.totalFiles != null) setTotalFiles(progress.totalFiles)

      if (progress.manifestPath != null) {
        setManifestPath(progress.manifestPath)
        setStage(STAGE_REPORTING)
      }
    }
    ipcRenderer.on('uploadProgress', handleUploadProgress)
    return () => ipcRenderer.off('uploadProgress', handleUploadProgress)
  })

  if (stage === STAGE_ERRORING) {
    return (
      <Layout>
        <ErrorMessage message={error} onClose={() => setStage(STAGE_PICKING)} />
      </Layout>
    )
  }

  if (stage === STAGE_REPORTING) {
    return (
      <Layout>
        <Reporter manifestPath={manifestPath} onClose={() => setStage(STAGE_PICKING)} />
      </Layout>
    )
  }

  if (stage === STAGE_UPLOADING) {
    return (
      <Layout>
        <UploadProgress
          statusText={statusText}
          storedBytes={storedBytes}
          storedChunks={storedChunks}
          totalBytes={totalBytes}
          totalFiles={totalFiles}
        />
      </Layout>
    )
  }

  if (stage === STAGE_AUTHENTICATING) {
    const onToken = async token => {
      await ipcRenderer.invoke('setApiToken', token)
      setStage(STAGE_PICKING)
    }
    return (
      <Layout>
        <TokenForm onToken={onToken} />
      </Layout>
    )
  }

  const handleSingledirUpload = async dir => {

    const path = dir.path
    setdirPaths(dirPaths)
    setStatusText('Reading dirs...')
    setCid('')


    const hasToken = await ipcRenderer.invoke('hasApiToken')
    if (!hasToken) {
      return setStage(STAGE_AUTHENTICATING)
    }

    setStage(STAGE_UPLOADING)
    ipcRenderer.send('uploadFiles', [path], dir.name)
  }

  const onPickFiles = async dirs => {
    setTotalFiles(dirs.length)
    setStoredBytes(0)
    setStoredChunks(0)
    setTotalBytes(dirs.reduce((total, f) => total + f.size, 0))
    dirs.forEach(handleSingledirUpload)
    setError('')
  }
  return (
    <Layout>
      <FilePicker onPickFiles={onPickFiles} />
    </Layout>
  )
}

function Layout ({ children }) {
  return (
    <div className='flex items-center vh-100'>
      <div className='flex-none'>
        <img src='logo-nftup.svg' width='256' className='ma4 mr0' alt='NFT UP logo' />
      </div>
      <div className='flex-auto h-100 flex'>
        {children}
      </div>
    </div>
  )
}
