import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function middleware(req) {
  let response = NextResponse.next({
    request: { headers: req.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            req.cookies.set(name, value)
          )
          response = NextResponse.next({
            request: { headers: req.headers },
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user }, error } = await supabase.auth.getUser()
  const pathname = req.nextUrl.pathname

  // will cause anon users to never be able to log in to existing accounts via reset:
  // // ✅ Only redirect away from forgot-password for anonymous users
  // if (pathname === '/login/forgot-password') {
  //   if (user?.is_anonymous && !error) {
  //     return NextResponse.redirect(new URL('/login', req.url))
  //   }
  // }

  if (pathname === '/login/reset') {
    if (!user || user.is_anonymous || error) {
      return NextResponse.redirect(new URL('/login', req.url))
    }
  }

  const authPages = ['/login', '/sign-up']
  if (authPages.includes(pathname)) {
    if (user && !user.is_anonymous && !error) {
      return NextResponse.redirect(new URL('/create', req.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)', //match all routes except static files
  ],
}