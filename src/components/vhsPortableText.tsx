import {PortableTextComponents} from '@portabletext/react'
import {ReactNode} from 'react'
import SanityImage from '@/components/SanityImage'
import {imageAlt} from '@/lib/imageAlt'
import type {SanityImageValue} from '@/lib/sanityImage'

type ArticleImage = SanityImageValue & {alt?: string | null; caption?: string | null}

export function createVhsPortableTextComponents(
  fallbackAlt: string,
  options?: {
    hideRef?: string | null
    onOpen?: (image: ArticleImage) => void
  },
): PortableTextComponents {
  return {
    types: {
      image: ({value}: {value: ArticleImage}) => {
        if (!value?.asset?._ref) return null
        if (options?.hideRef && value.asset._ref === options.hideRef) return null
        const figure = (
          <figure className="prose-figure">
            <SanityImage
              image={value}
              alt={imageAlt(value.alt, fallbackAlt)}
              sizes="(max-width: 800px) 100vw, 720px"
              className="lightbox-photo"
            />
            {value.caption ? <figcaption className="meta">{value.caption}</figcaption> : null}
          </figure>
        )
        if (!options?.onOpen) return figure
        return (
          <button type="button" className="prose-shot" onClick={() => options.onOpen?.(value)}>
            {figure}
          </button>
        )
      },
    },
    block: {
      h1: ({children}: {children?: ReactNode}) => <h2 className="section-heading">{children}</h2>,
      h2: ({children}: {children?: ReactNode}) => <h2 className="section-heading">{children}</h2>,
      h3: ({children}: {children?: ReactNode}) => <h3>{children}</h3>,
      normal: ({children}: {children?: ReactNode}) => <p>{children}</p>,
      blockquote: ({children}: {children?: ReactNode}) => <blockquote>{children}</blockquote>,
    },
    list: {
      bullet: ({children}: {children?: ReactNode}) => <ul>{children}</ul>,
      number: ({children}: {children?: ReactNode}) => <ol>{children}</ol>,
    },
    listItem: {
      bullet: ({children}: {children?: ReactNode}) => <li>{children}</li>,
      number: ({children}: {children?: ReactNode}) => <li>{children}</li>,
    },
    marks: {
      strong: ({children}: {children?: ReactNode}) => <strong>{children}</strong>,
      em: ({children}: {children?: ReactNode}) => <em>{children}</em>,
      code: ({children}: {children?: ReactNode}) => <code>{children}</code>,
    },
  }
}
