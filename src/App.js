import { useEffect, useState } from 'react'
import { FilePicker } from './FilePicker.js'
import { UploadProgress } from './UploadProgress.js'
import { Reporter } from './Reporter.js'
import { ErrorMessage } from './ErrorMessage.js'
import { TokenForm } from './TokenForm.js'
import Directory from './Directory.js'
const { ipcRenderer } = window.require('electron')

const STAGE_PICKING = 'picking'
const STAGE_PICKED = 'picked'
const STAGE_AUTHENTICATING = 'authenticating'
const STAGE_ERRORING = 'erroring'
const STAGE_REPORTING = 'reporting'


export function App () {
  const [stage, setStage] = useState(STAGE_PICKING)

  const [dataStore, updateDataStore] = useState({})

  useEffect(() => {

    const handleDirsetConfirmed = async (_, dataStore) => {
      updateDataStore(dataStore)
      setStage(STAGE_PICKED)
    }

    const handleUploadProgress = async (_, dataStore) => {
      if (dataStore.error != null) {
        setStage(STAGE_ERRORING)
        return
      }

      if (dataStore.dirSet) {
        updateDataStore(dataStore)
      }

      if (dataStore.manifestPath != null) {
        updateDataStore(dataStore)
        // setStage(STAGE_REPORTING)
      }
    }
    ipcRenderer.on('uploadProgress', handleUploadProgress)
    ipcRenderer.on('dirSetConfirmed', handleDirsetConfirmed)
    return () => ipcRenderer.off('uploadProgress', handleUploadProgress)
  })

  if (stage === STAGE_ERRORING) {
    return (
      <Layout>
        <ErrorMessage message={dataStore.error} onClose={() => setStage(STAGE_PICKING)} />
      </Layout>
    )
  }

  if (stage === STAGE_REPORTING) {
    return (
      <Layout>
        <Reporter manifestPath={dataStore.manifestPath} onClose={() => setStage(STAGE_PICKING)} />
      </Layout>
    )
  }

  if (stage == STAGE_PICKED) {
    return (
      <Layout>
        <div>{dataStore?.manifestPath} </div>
        <Directory 
          subdirectories={dataStore?.dirSet?.subdirectories || []} 
          name={dataStore?.dirSet?.name || ''}
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

  const onPickFiles = async dir => {
    ipcRenderer.send('setDir', dir[0].path, dir[0].name)
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
