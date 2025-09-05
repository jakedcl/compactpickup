'use client'

import { Canvas } from '@react-three/fiber'
import { OrbitControls, useGLTF, Environment, Html } from '@react-three/drei'
import { Suspense, useState, useEffect, useCallback } from 'react'
import * as THREE from 'three'

// Preload the GLTF to catch errors early
function preloadGLTF(url: string) {
  return new Promise((resolve, reject) => {
    useGLTF.preload(url, undefined, (error) => {
      console.error('GLTF Preload error:', error)
      reject(error)
    })
    resolve(true)
  })
}

interface TruckModel3DProps {
  modelUrl: string
  className?: string
  attribution?: {
    creator: string
    source: string
    license: string
  }
}

function Model({ url, onError }: { url: string; onError: (error: string) => void }) {
  try {
    const gltf = useGLTF(url)
    
    // Check if the GLTF loaded properly
    if (!gltf || !gltf.scene) {
      onError('GLB file loaded but no 3D scene found')
      return null
    }
    
    // Auto-scale the model to fit in view
    const scene = gltf.scene.clone()
    
    // Calculate bounding box to determine scale
    const box = new THREE.Box3().setFromObject(scene)
    const size = box.getSize(new THREE.Vector3())
    const maxSize = Math.max(size.x, size.y, size.z)
    
    // Scale to make the model a good size (around 4 units)
    const targetSize = 4
    const scale = targetSize / maxSize
    scene.scale.setScalar(scale)
    
    // Center the model
    const center = box.getCenter(new THREE.Vector3())
    scene.position.set(-center.x * scale, -center.y * scale, -center.z * scale)
    
    return <primitive object={scene} />
  } catch (error) {
    console.error('3D Model loading error:', error)
    let errorMessage = 'Unknown error'
    
    if (error instanceof Error) {
      errorMessage = error.message
    } else if (typeof error === 'string') {
      errorMessage = error
    } else if (error && typeof error === 'object') {
      errorMessage = JSON.stringify(error)
    }
    
    onError(`Loading failed: ${errorMessage}`)
    return null
  }
}

function LoadingSpinner() {
  return (
    <Html center>
      <div className="flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
          <div className="text-sm opacity-75">Loading 3D Model...</div>
        </div>
      </div>
    </Html>
  )
}

function ErrorFallback({ errorMessage }: { errorMessage?: string }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-white text-center max-w-md">
        <div className="text-red-400 text-4xl mb-4">⚠️</div>
        <div className="text-lg mb-2">3D Model Error</div>
        <div className="text-sm opacity-75 mb-4">{errorMessage || 'Could not load 3D model'}</div>
        <div className="text-xs opacity-60">
          Possible issues:<br/>
          • GLB file may be corrupted<br/>
          • File too large for browser<br/>
          • WebGL context issues<br/>
          Try refreshing or use a different GLB file.
        </div>
      </div>
    </div>
  )
}

export default function TruckModel3D({ modelUrl, className = "", attribution }: TruckModel3DProps) {
  const [hasError, setHasError] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  
  // Check if URL is valid GLB
  const isValidGLB = modelUrl && (modelUrl.endsWith('.glb') || modelUrl.includes('.glb'))
  
  const handleError = useCallback((message: string) => {
    console.error('3D Model Error:', message)
    console.error('Model URL:', modelUrl)
    setErrorMessage(message)
    setHasError(true)
  }, [modelUrl])
  
  // Test if the file is accessible and preload it
  useEffect(() => {
    if (isValidGLB) {
      fetch(modelUrl, { method: 'HEAD' })
        .then(response => {
          if (!response.ok) {
            handleError(`File not accessible: ${response.status} ${response.statusText}`)
          } else {
            console.log('GLB file is accessible:', {
              size: response.headers.get('content-length'),
              type: response.headers.get('content-type')
            })
            
            // Preload the GLTF
            preloadGLTF(modelUrl).catch(error => {
              handleError(`Preload failed: ${error.message || 'Unknown preload error'}`)
            })
          }
        })
        .catch(error => {
          handleError(`Network error: ${error.message}`)
        })
    }
  }, [modelUrl, isValidGLB, handleError])
  
  // Early return for invalid URLs
  if (!isValidGLB) {
    return (
      <div className={`vhs-3d-viewer ${className}`}>
        <div className="bg-black/40 border border-white/30 p-4 mb-6">
          <h3 className="text-white text-lg mb-4 text-center font-mono uppercase tracking-wider">
            3D Model Viewer
          </h3>
          <div className="h-96 bg-black/20 border border-white/20">
            <ErrorFallback errorMessage="Invalid file format. Please upload a GLB file." />
          </div>
        </div>
      </div>
    )
  }

  if (hasError) {
    return (
      <div className={`vhs-3d-viewer ${className}`}>
        <div className="bg-black/40 border border-white/30 p-4 mb-6">
          <h3 className="text-white text-lg mb-4 text-center font-mono uppercase tracking-wider">
            3D Model Viewer
          </h3>
          <div className="h-96 bg-black/20 border border-white/20">
            <ErrorFallback errorMessage={errorMessage} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`vhs-3d-viewer ${className}`}>
      <div className="bg-black/40 border border-white/30 p-4 mb-6">
        <h3 className="text-white text-lg mb-4 text-center font-mono uppercase tracking-wider">
          3D Model Viewer
        </h3>
        <div className="h-96 bg-black/20 border border-white/20">
          <Canvas
            camera={{ position: [4, 3, 4], fov: 60 }}
            style={{ background: 'radial-gradient(circle, #001133 0%, #000000 100%)' }}
            onCreated={({ gl }) => {
              gl.setClearColor('#001133')
            }}
          >
            <Suspense fallback={<LoadingSpinner />}>
              <Environment preset="studio" />
              <ambientLight intensity={0.5} />
              <directionalLight position={[10, 10, 5]} intensity={1} />
              <Model url={modelUrl} onError={handleError} />
              <OrbitControls 
                enablePan={true}
                enableZoom={true}
                enableRotate={true}
                minDistance={0.5}
                maxDistance={20}
                autoRotate={false}
                target={[0, 0, 0]}
                enableDamping={true}
                dampingFactor={0.05}
              />
            </Suspense>
          </Canvas>
        </div>
        {/* Controls */}
        <div className="text-center mt-4 text-white/60 text-xs font-mono">
          <div className="hidden md:block">
            Drag: Rotate • Scroll: Zoom • Right+Drag: Pan
          </div>
          <div className="md:hidden">
            Touch: Rotate • Pinch: Zoom • Two-finger: Pan
          </div>
        </div>
        
        {/* Attribution */}
        {attribution && (
          <div className="mt-4 pt-3 border-t border-white/20 text-center">
            <div className="text-white/60 text-xs font-mono">
              <div className="mb-1">
                3D Model by{' '}
                <a 
                  href={attribution.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-yellow-400 hover:text-yellow-300 underline"
                >
                  {attribution.creator}
                </a>
              </div>
              <div className="text-white/40">
                License: {attribution.license}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
