import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { client } from '@gradio/client'
import '../styles/VirtualTryOn.css'

function VirtualTryOn() {
  const navigate = useNavigate()
  const { state } = useLocation()
  const garmentImage = state?.garmentImage || null

  const [personImage, setPersonImage] = useState(null)
  const [personFile, setPersonFile] = useState(null)
  const [resultImage, setResultImage] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!garmentImage) {
      setError('No garment selected. Please open virtual try-on from the product preview.')
    }
  }, [garmentImage])

  useEffect(() => {
    if (!loading) {
      setProgress(100)
      return undefined
    }
    setProgress(0)
    const interval = setInterval(() => {
      setProgress((prev) => (prev < 90 ? prev + Math.random() * 10 : prev))
    }, 600)
    return () => clearInterval(interval)
  }, [loading])

  const processImage = async (image, filename) => {
    if (typeof image === 'string' && image.startsWith('data:')) {
      return await base64ToFile(image, filename)
    }

    const response = await fetch(image)
    const blob = await response.blob()
    return new File([blob], filename, { type: blob.type || 'image/jpeg' })
  }

  const base64ToFile = async (base64String, filename) => {
    const data = base64String.split(',')[1]
    const byteString = atob(data)
    const arrayBuffer = new ArrayBuffer(byteString.length)
    const uint8Array = new Uint8Array(arrayBuffer)

    for (let i = 0; i < byteString.length; i += 1) {
      uint8Array[i] = byteString.charCodeAt(i)
    }

    return new File([uint8Array], filename, { type: 'image/jpeg' })
  }

  const handleImageUpload = (event) => {
    const file = event.target.files?.[0]
    if (!file || !file.type.startsWith('image/')) {
      setError('Please upload a valid photo file.')
      return
    }
    const reader = new FileReader()
    reader.onloadend = () => {
      setPersonImage(reader.result)
      setPersonFile(file)
      setError(null)
    }
    reader.readAsDataURL(file)
  }

  const generateTryOn = async () => {
    if (!garmentImage) {
      setError('No garment selected. Please open virtual try-on from the product preview.')
      return
    }
    if (!personFile || !personImage) {
      setError('Please upload your photo to continue.')
      return
    }

    setLoading(true)
    setError(null)
    setResultImage(null)

    try {
      const app = await client('franciszzj/Leffa')
      const processedPerson = await processImage(personImage, 'person.jpg')
      const processedGarment = await processImage(garmentImage, 'garment.jpg')
      const result = await app.predict('/leffa_predict_vt', [
        processedPerson,
        processedGarment,
        false,
        30,
        2.5,
        42,
        'viton_hd',
        'upper_body',
        false,
      ])

      const output = result?.data?.[0]
      if (!output) {
        throw new Error('No result received from the try-on service.')
      }

      const finalUrl =
        typeof output === 'string'
          ? output.startsWith('data:') || output.startsWith('http')
            ? output
            : `data:image/jpeg;base64,${output}`
          : output?.url || (output instanceof Blob ? URL.createObjectURL(output) : null)

      if (!finalUrl) {
        throw new Error('Unsupported response from try-on service.')
      }

      setResultImage(finalUrl)
    } catch (err) {
      setError(err?.message || 'Failed to generate the try-on. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = () => {
    if (!resultImage) return
    const a = document.createElement('a')
    a.href = resultImage
    a.download = 'virtual-tryon-result.jpg'
    a.click()
  }

  return (
    <div className="vto-page">
      <div className="vto-page-header">
        <button className="vto-back-btn" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <h1>Virtual Try-On</h1>
      </div>

      <div className="vto-grid">
        <section className="vto-panel vto-panel-garment">
          <h2>Selected Garment</h2>
          <div className="vto-card">
            {garmentImage ? (
              <img src={garmentImage} alt="Garment" className="vto-garment-image" />
            ) : (
              <div className="vto-empty-state">
                <p>No garment selected.</p>
                <p>Open the cloth preview and click Virtual Try-On.</p>
              </div>
            )}
          </div>
        </section>

        <section className="vto-panel vto-panel-user">
          <h2>Your Photo</h2>
          <div className="vto-card upload-card">
            <label className="vto-upload-label">
              <input type="file" accept="image/*" onChange={handleImageUpload} hidden />
              <div className="vto-upload-content">
                <span className="vto-upload-icon">📤</span>
                <span>{personImage ? 'Change your photo' : 'Upload your photo'}</span>
                <small>PNG, JPG, WEBP · Max 10MB</small>
              </div>
            </label>
            {personImage && (
              <div className="vto-user-preview">
                <img src={personImage} alt="You" />
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="vto-actions">
        <button
          className="vto-cta-btn"
          onClick={generateTryOn}
          disabled={loading || !garmentImage || !personImage}
        >
          {loading ? 'Generating your look…' : 'Generate Try-On'}
        </button>
        <button className="vto-secondary-btn" onClick={() => navigate(-1)}>
          Choose a different cloth
        </button>
      </div>

      {error && <div className="vto-message error">{error}</div>}

      {loading && (
        <div className="vto-progress">
          <div className="vto-progress-bar" style={{ width: `${progress}%` }} />
        </div>
      )}

      {resultImage && (
        <section className="vto-result-section">
          <div className="vto-result-header">
            <h2>Virtual Try-On Result</h2>
            <button className="vto-download-btn" onClick={handleDownload}>
              Download
            </button>
          </div>
          <div className="vto-result-card">
            <img src={resultImage} alt="Try-On Result" />
          </div>
        </section>
      )}
    </div>
  )
}

export default VirtualTryOn
