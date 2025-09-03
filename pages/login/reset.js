import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useForm } from 'react-hook-form';
import Header from '@/components/Header';
import { useRouter } from 'next/router';



export default function ResetPassword() {
    const { register, handleSubmit, watch, formState: { isSubmitting, isSubmitSuccessful, errors  } } = useForm();
    const [user, setUser] = useState(''); //to show the user's email
    const [error, setError] = useState('');
    const router = useRouter();

    const password = watch('password', ''); //returns initially empty string instead of undefined
    const confirmPassword = watch('confirmPassword', '');//returns initially empty string instead of undefined

    // Password requirements
    const passwordRequirements = {
        minLength: password.length >= 12,
        hasUppercase: /[A-Z]/.test(password),
        hasLowercase: /[a-z]/.test(password),
        hasNumber: /\d/.test(password),
        hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    };

    const allRequirementsMet = Object.values(passwordRequirements).every(req => req);
    const passwordsMatch = password === confirmPassword;

    useEffect(() => {
    const handlePasswordReset = async () => {
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const type = hashParams.get('type');
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        
        if (type !== 'recovery' || !accessToken || !refreshToken) {
            setError("We're sorry, but this reset password link is expired or invalid.");
            return;
        }

        // Set the session - this creates cookies for the API to use
        const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken
        });

        if (error) {
        setError("We're sorry, but this reset password link is expired or invalid.");
        } else {
        setUser(data.session.user);
        window.history.replaceState(null, null, window.location.pathname);  // Clear hash for security
        }
    };

    handlePasswordReset();
    }, []);


    if (error === "We're sorry, but this reset password link is expired or invalid.") {
        return (
            <div>
                <Header />
                <p style={{ color: 'red' }}>{error}</p>
                <p><a href="/login">Go back to login</a></p>
            </div>
        );
    }

    const onSubmit = async (data) => {
    //removes naive approach of trusting client-side validation, new flow: client →  server → Supabase
    const response = await fetch('/api/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: data.password })
    });

    if (!response.ok) {
        const { error } = await response.json();
        setError(error);
    } else {
        router.push('/');
    }
    };

    return (
        <div>
            {!isSubmitSuccessful ? 
            (<>
            <Header/>
            <form onSubmit={handleSubmit(onSubmit)}>
                <label>
                    Email:
                    <input 
                        type="email" 
                        value={user?.email || ''}
                        readOnly
                    />
                </label>
                <label>
                    New Password:
                    <input type="password" {...register('password', {
                        required: 'Password is required',
                        validate: () => allRequirementsMet || 'Password does not meet all requirements'
                    })} />
                    {errors.password && <span style={{ color: 'red' }}>{errors.password.message}</span>}
                </label>
                <label>
                    Confirm New Password:
                    <input type="password" {...register('confirmPassword', {
                        required: 'Please confirm your password',
                        validate: (value) => value === password || 'Passwords do not match'
                    })} />
                    {errors.confirmPassword && <span style={{ color: 'red' }}>{errors.confirmPassword.message}</span>}
                </label>
                {password && (
                <div style={{ 
                    marginTop: '10px', 
                    padding: '10px', 
                    border: '1px solid #ccc', 
                    borderRadius: '4px',
                    backgroundColor: '#f9f9f9'
                }}>
                    <h4>Password Requirements:</h4>
                    <ul style={{ margin: 0, paddingLeft: '20px' }}>
                    <li style={{ 
                        color: passwordRequirements.minLength ? 'green' : 'red' 
                    }}>
                        {passwordRequirements.minLength ? '✓' : '✗'} At least 12 characters
                    </li>
                    <li style={{ 
                        color: passwordRequirements.hasUppercase ? 'green' : 'red' 
                    }}>
                        {passwordRequirements.hasUppercase ? '✓' : '✗'} One uppercase letter (A-Z)
                    </li>
                    <li style={{ 
                        color: passwordRequirements.hasLowercase ? 'green' : 'red' 
                    }}>
                        {passwordRequirements.hasLowercase ? '✓' : '✗'} One lowercase letter (a-z)
                    </li>
                    <li style={{ 
                        color: passwordRequirements.hasNumber ? 'green' : 'red' 
                    }}>
                        {passwordRequirements.hasNumber ? '✓' : '✗'} One number (0-9)
                    </li>
                    <li style={{ 
                        color: passwordRequirements.hasSpecialChar ? 'green' : 'red' 
                    }}>
                        {passwordRequirements.hasSpecialChar ? '✓' : '✗'} One special character (!@#$%^&*)
                    </li>
                    <li style={{ 
                        color: passwordsMatch ? 'green' : 'red' 
                    }}>
                        {passwordsMatch ? '✓' : '✗'} Passwords match
                    </li>
                    </ul>
                </div>
                )}                
                <button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Resetting password...' : 'Reset password'}
                </button>
                {error && <p style={{ color: 'red' }}>{error}</p>}
            </form>
            </>) 
            : 
            (
            <>
            <Header/>
            <p>Password reset successful!</p>
            </>)}
        </div>
    );
}