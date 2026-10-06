import Image from 'next/image'
import {PortableTextComponents} from '@portabletext/react'
import {ReactNode} from 'react'
import {imageAlt} from '@/lib/imageAlt'
import {urlFor} from '@/lib/sanity'

interface ImageValue {
  alt?: string
  caption?: string
  asset: {
    _ref: string
  }
}

export function createVhsPortableTextComponents(fallbackAlt: string): PortableTextComponents {
  return {
    types: {
      image: ({value}: {value: ImageValue}) => (
        <div className="my-6 border border-white/30 p-3 bg-black/20">
          <Image
            src={urlFor(value).width(600).height(400).url()}
            alt={imageAlt(value.alt, fallbackAlt)}
            width={600}
            height={400}
            className="w-full h-auto"
          />
          {value.caption && (
            <p className="text-white/80 text-xs mt-2 text-center uppercase tracking-wider">
              {value.caption}
            </p>
          )}
        </div>
      ),
    },
    block: {
      h1: ({children}: {children?: ReactNode}) => (
        <div className="vhs-header mb-4">
          {children}
        </div>
      ),
      h2: ({children}: {children?: ReactNode}) => (
        <h2 className="text-lg font-bold text-white mb-3 uppercase tracking-wider border-b border-white/20 pb-2">
          {children}
        </h2>
      ),
      h3: ({children}: {children?: ReactNode}) => (
        <h3 className="text-base font-bold text-white mb-2 uppercase tracking-wide">
          {children}
        </h3>
      ),
      normal: ({children}: {children?: ReactNode}) => (
        <p className="text-white/90 mb-3 text-sm leading-relaxed">
          {children}
        </p>
      ),
      blockquote: ({children}: {children?: ReactNode}) => (
        <div className="border-l-2 border-white/40 pl-4 my-4 text-white/80 italic bg-black/20 p-3">
          {children}
        </div>
      ),
    },
    list: {
      bullet: ({children}: {children?: ReactNode}) => (
        <ul className="list-none text-white/90 mb-4 space-y-1">
          {Array.isArray(children) && children?.map((child: ReactNode, index: number) => (
            <li key={index} className="flex items-start">
              <span className="text-yellow-400 mr-2">▶</span>
              <span className="text-sm">{child}</span>
            </li>
          ))}
        </ul>
      ),
      number: ({children}: {children?: ReactNode}) => (
        <ol className="list-none text-white/90 mb-4 space-y-1">
          {Array.isArray(children) && children?.map((child: ReactNode, index: number) => (
            <li key={index} className="flex items-start">
              <span className="text-yellow-400 mr-2">{index + 1}.</span>
              <span className="text-sm">{child}</span>
            </li>
          ))}
        </ol>
      ),
    },
    marks: {
      strong: ({children}: {children?: ReactNode}) => (
        <strong className="text-white font-bold uppercase">{children}</strong>
      ),
      em: ({children}: {children?: ReactNode}) => (
        <em className="text-yellow-400">{children}</em>
      ),
      code: ({children}: {children?: ReactNode}) => (
        <code className="bg-white/20 px-1 py-0.5 text-yellow-400 text-xs">
          {children}
        </code>
      ),
    },
  }
}
