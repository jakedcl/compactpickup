import {PortableTextComponents} from '@portabletext/react'
import {ReactNode} from 'react'

export function createVhsPortableTextComponents(): PortableTextComponents {
  return {
    types: {
      image: () => null,
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
