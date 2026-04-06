export interface ShaderInfo {
  id: string;
  name: string;
  description: string;
  category: 'toon' | 'effect' | 'utility' | 'transparent';
  color: string;
  code: string;
}

export const builtInShaders: ShaderInfo[] = [
  {
    id: 'toon-cel',
    name: 'VRC Toon Cel',
    description: 'Classic cel-shaded toon shader with adjustable shadow steps, rim lighting, and outline support. Great for anime-style avatars.',
    category: 'toon',
    color: '#f472b6',
    code: `Shader "VRCStudio/ToonCel"
{
    Properties
    {
        _MainTex ("Main Texture", 2D) = "white" {}
        _Color ("Tint Color", Color) = (1, 1, 1, 1)
        _ShadowColor ("Shadow Color", Color) = (0.4, 0.35, 0.5, 1)
        _ShadowThreshold ("Shadow Threshold", Range(0, 1)) = 0.5
        _ShadowSoftness ("Shadow Softness", Range(0, 0.5)) = 0.05
        _RimColor ("Rim Light Color", Color) = (1, 1, 1, 1)
        _RimPower ("Rim Power", Range(0.5, 8)) = 3.0
        _RimIntensity ("Rim Intensity", Range(0, 1)) = 0.3
        _OutlineWidth ("Outline Width", Range(0, 0.05)) = 0.003
        _OutlineColor ("Outline Color", Color) = (0.1, 0.1, 0.1, 1)
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }

        // Outline pass
        Pass
        {
            Name "OUTLINE"
            Cull Front
            ZWrite On

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag

            #include "UnityCG.cginc"

            float _OutlineWidth;
            float4 _OutlineColor;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
            };

            v2f vert(appdata v)
            {
                v2f o;
                float3 norm = normalize(mul((float3x3)UNITY_MATRIX_IT_MV, v.normal));
                float4 pos = UnityObjectToClipPos(v.vertex);
                float2 offset = TransformViewToProjection(norm.xy);
                pos.xy += offset * _OutlineWidth * pos.w;
                o.pos = pos;
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                return _OutlineColor;
            }
            ENDCG
        }

        // Main toon pass
        Pass
        {
            Name "TOON"
            Tags { "LightMode"="ForwardBase" }
            Cull Back

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fwdbase

            #include "UnityCG.cginc"
            #include "Lighting.cginc"
            #include "AutoLight.cginc"

            sampler2D _MainTex;
            float4 _MainTex_ST;
            float4 _Color;
            float4 _ShadowColor;
            float _ShadowThreshold;
            float _ShadowSoftness;
            float4 _RimColor;
            float _RimPower;
            float _RimIntensity;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 worldNormal : TEXCOORD1;
                float3 worldPos : TEXCOORD2;
                SHADOW_COORDS(3)
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                TRANSFER_SHADOW(o);
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                float3 normal = normalize(i.worldNormal);
                float3 lightDir = normalize(_WorldSpaceLightPos0.xyz);
                float3 viewDir = normalize(_WorldSpaceCameraPos - i.worldPos);

                // Cel shading
                float NdotL = dot(normal, lightDir);
                float shadow = smoothstep(_ShadowThreshold - _ShadowSoftness, _ShadowThreshold + _ShadowSoftness, NdotL * 0.5 + 0.5);

                float4 tex = tex2D(_MainTex, i.uv) * _Color;
                float3 lit = lerp(_ShadowColor.rgb, float3(1,1,1), shadow) * _LightColor0.rgb;

                // Rim lighting
                float rim = 1.0 - saturate(dot(viewDir, normal));
                rim = pow(rim, _RimPower) * _RimIntensity;
                float3 rimCol = _RimColor.rgb * rim;

                float atten = SHADOW_ATTENUATION(i);
                float3 final = tex.rgb * lit * atten + rimCol;

                return float4(final, tex.a);
            }
            ENDCG
        }
    }
    FallBack "Diffuse"
}`,
  },
  {
    id: 'outline-edge',
    name: 'VRC Edge Outline',
    description: 'Configurable outline shader using inverted hull method. Supports color, width, and distance fade for clean outlines at any distance.',
    category: 'toon',
    color: '#818cf8',
    code: `Shader "VRCStudio/EdgeOutline"
{
    Properties
    {
        _MainTex ("Main Texture", 2D) = "white" {}
        _Color ("Color", Color) = (1, 1, 1, 1)
        _OutlineColor ("Outline Color", Color) = (0, 0, 0, 1)
        _OutlineWidth ("Outline Width", Range(0, 0.1)) = 0.005
        _OutlineFadeStart ("Outline Fade Start", Float) = 5.0
        _OutlineFadeEnd ("Outline Fade End", Float) = 15.0
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }

        // Outline pass - renders backfaces extruded along normals
        Pass
        {
            Name "OUTLINE"
            Cull Front
            ZWrite On
            ColorMask RGB

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #include "UnityCG.cginc"

            float _OutlineWidth;
            float4 _OutlineColor;
            float _OutlineFadeStart;
            float _OutlineFadeEnd;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float4 color : COLOR;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float dist : TEXCOORD0;
            };

            v2f vert(appdata v)
            {
                v2f o;
                float3 worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                o.dist = distance(_WorldSpaceCameraPos, worldPos);

                // Scale outline width with distance for consistent screen-space width
                float distScale = saturate(1.0 - (o.dist - _OutlineFadeStart) / max(_OutlineFadeEnd - _OutlineFadeStart, 0.001));
                float width = _OutlineWidth * distScale;

                float3 norm = normalize(mul((float3x3)UNITY_MATRIX_IT_MV, v.normal));
                float4 pos = UnityObjectToClipPos(v.vertex);
                float2 offset = TransformViewToProjection(norm.xy);
                pos.xy += offset * width * pos.w;
                o.pos = pos;
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                return _OutlineColor;
            }
            ENDCG
        }

        // Base pass
        Pass
        {
            Name "BASE"
            Tags { "LightMode"="ForwardBase" }
            Cull Back

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fwdbase

            #include "UnityCG.cginc"
            #include "Lighting.cginc"
            #include "AutoLight.cginc"

            sampler2D _MainTex;
            float4 _MainTex_ST;
            float4 _Color;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 worldNormal : TEXCOORD1;
                SHADOW_COORDS(2)
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                TRANSFER_SHADOW(o);
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                float3 normal = normalize(i.worldNormal);
                float NdotL = max(0, dot(normal, normalize(_WorldSpaceLightPos0.xyz)));
                float4 tex = tex2D(_MainTex, i.uv) * _Color;
                float atten = SHADOW_ATTENUATION(i);
                float3 diffuse = tex.rgb * _LightColor0.rgb * NdotL * atten;
                float3 ambient = tex.rgb * UNITY_LIGHTMODEL_AMBIENT.rgb;
                return float4(diffuse + ambient, tex.a);
            }
            ENDCG
        }
    }
    FallBack "Diffuse"
}`,
  },
  {
    id: 'glow-emission',
    name: 'VRC Glow Emission',
    description: 'Emission shader with pulsing glow effect. Supports emission map, pulse speed/intensity, and HDR color for bloom-compatible glowing.',
    category: 'effect',
    color: '#34d399',
    code: `Shader "VRCStudio/GlowEmission"
{
    Properties
    {
        _MainTex ("Main Texture", 2D) = "white" {}
        _Color ("Base Color", Color) = (1, 1, 1, 1)
        _EmissionMap ("Emission Map", 2D) = "black" {}
        [HDR] _EmissionColor ("Emission Color", Color) = (0, 1, 1, 1)
        _EmissionIntensity ("Emission Intensity", Range(0, 10)) = 2.0
        _PulseSpeed ("Pulse Speed", Range(0, 10)) = 1.5
        _PulseMin ("Pulse Minimum", Range(0, 1)) = 0.3
        _PulseMax ("Pulse Maximum", Range(0, 1)) = 1.0
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }

        Pass
        {
            Tags { "LightMode"="ForwardBase" }

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fwdbase

            #include "UnityCG.cginc"
            #include "Lighting.cginc"
            #include "AutoLight.cginc"

            sampler2D _MainTex;
            float4 _MainTex_ST;
            float4 _Color;
            sampler2D _EmissionMap;
            float4 _EmissionColor;
            float _EmissionIntensity;
            float _PulseSpeed;
            float _PulseMin;
            float _PulseMax;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 worldNormal : TEXCOORD1;
                SHADOW_COORDS(2)
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                TRANSFER_SHADOW(o);
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                float3 normal = normalize(i.worldNormal);
                float NdotL = max(0, dot(normal, normalize(_WorldSpaceLightPos0.xyz)));

                float4 tex = tex2D(_MainTex, i.uv) * _Color;
                float atten = SHADOW_ATTENUATION(i);
                float3 diffuse = tex.rgb * _LightColor0.rgb * NdotL * atten;
                float3 ambient = tex.rgb * UNITY_LIGHTMODEL_AMBIENT.rgb;

                // Pulsing emission
                float pulse = lerp(_PulseMin, _PulseMax, (sin(_Time.y * _PulseSpeed) * 0.5 + 0.5));
                float4 emission = tex2D(_EmissionMap, i.uv) * _EmissionColor * _EmissionIntensity * pulse;

                float3 final = diffuse + ambient + emission.rgb;
                return float4(final, tex.a);
            }
            ENDCG
        }
    }
    FallBack "Diffuse"
}`,
  },
  {
    id: 'holographic',
    name: 'VRC Holographic',
    description: 'Iridescent holographic shader with view-angle color shifting, fresnel effect, and scanline overlay. Perfect for sci-fi and futuristic looks.',
    category: 'effect',
    color: '#c084fc',
    code: `Shader "VRCStudio/Holographic"
{
    Properties
    {
        _MainTex ("Main Texture", 2D) = "white" {}
        _Color ("Base Tint", Color) = (0.1, 0.1, 0.15, 1)
        [HDR] _HoloColor1 ("Holo Color 1", Color) = (0, 2, 2, 1)
        [HDR] _HoloColor2 ("Holo Color 2", Color) = (2, 0, 2, 1)
        [HDR] _HoloColor3 ("Holo Color 3", Color) = (2, 2, 0, 1)
        _HoloSpeed ("Color Shift Speed", Range(0, 5)) = 1.0
        _FresnelPower ("Fresnel Power", Range(0.5, 8)) = 2.5
        _FresnelIntensity ("Fresnel Intensity", Range(0, 3)) = 1.5
        _ScanlineScale ("Scanline Scale", Range(10, 500)) = 100.0
        _ScanlineSpeed ("Scanline Speed", Range(0, 10)) = 2.0
        _ScanlineIntensity ("Scanline Intensity", Range(0, 1)) = 0.15
        _Opacity ("Opacity", Range(0, 1)) = 0.85
    }

    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent" }
        Blend SrcAlpha OneMinusSrcAlpha
        ZWrite Off
        Cull Back

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag

            #include "UnityCG.cginc"

            sampler2D _MainTex;
            float4 _MainTex_ST;
            float4 _Color;
            float4 _HoloColor1;
            float4 _HoloColor2;
            float4 _HoloColor3;
            float _HoloSpeed;
            float _FresnelPower;
            float _FresnelIntensity;
            float _ScanlineScale;
            float _ScanlineSpeed;
            float _ScanlineIntensity;
            float _Opacity;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 worldNormal : TEXCOORD1;
                float3 worldPos : TEXCOORD2;
                float4 screenPos : TEXCOORD3;
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                o.screenPos = ComputeScreenPos(o.pos);
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                float3 normal = normalize(i.worldNormal);
                float3 viewDir = normalize(_WorldSpaceCameraPos - i.worldPos);

                // Fresnel
                float fresnel = pow(1.0 - saturate(dot(viewDir, normal)), _FresnelPower) * _FresnelIntensity;

                // View-dependent color shifting
                float angle = dot(viewDir, normal);
                float shift = angle * 3.0 + _Time.y * _HoloSpeed;
                float3 holoColor = _HoloColor1.rgb * saturate(sin(shift) * 0.5 + 0.5)
                                 + _HoloColor2.rgb * saturate(sin(shift + 2.094) * 0.5 + 0.5)
                                 + _HoloColor3.rgb * saturate(sin(shift + 4.189) * 0.5 + 0.5);

                // Scanlines
                float2 screenUV = i.screenPos.xy / i.screenPos.w;
                float scanline = sin(screenUV.y * _ScanlineScale + _Time.y * _ScanlineSpeed) * 0.5 + 0.5;
                scanline = lerp(1.0, scanline, _ScanlineIntensity);

                float4 tex = tex2D(_MainTex, i.uv);
                float3 base = _Color.rgb * tex.rgb;
                float3 final = base + holoColor * fresnel;
                final *= scanline;

                return float4(final, _Opacity);
            }
            ENDCG
        }
    }
    FallBack "Transparent/Diffuse"
}`,
  },
  {
    id: 'dissolve',
    name: 'VRC Dissolve',
    description: 'Dissolve transition shader with noise-based edge burn effect. Control dissolve amount in real-time for dramatic appear/disappear effects.',
    category: 'effect',
    color: '#fb923c',
    code: `Shader "VRCStudio/Dissolve"
{
    Properties
    {
        _MainTex ("Main Texture", 2D) = "white" {}
        _Color ("Color", Color) = (1, 1, 1, 1)
        _NoiseTex ("Dissolve Noise", 2D) = "white" {}
        _DissolveAmount ("Dissolve Amount", Range(0, 1)) = 0.0
        [HDR] _EdgeColor ("Edge Color", Color) = (3, 0.5, 0, 1)
        _EdgeWidth ("Edge Width", Range(0, 0.2)) = 0.05
        [HDR] _EdgeColor2 ("Edge Color Inner", Color) = (5, 3, 0, 1)
    }

    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }
        Cull Off

        Pass
        {
            Tags { "LightMode"="ForwardBase" }

            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_fwdbase

            #include "UnityCG.cginc"
            #include "Lighting.cginc"
            #include "AutoLight.cginc"

            sampler2D _MainTex;
            float4 _MainTex_ST;
            float4 _Color;
            sampler2D _NoiseTex;
            float4 _NoiseTex_ST;
            float _DissolveAmount;
            float4 _EdgeColor;
            float _EdgeWidth;
            float4 _EdgeColor2;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float2 noiseUV : TEXCOORD1;
                float3 worldNormal : TEXCOORD2;
                SHADOW_COORDS(3)
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.noiseUV = TRANSFORM_TEX(v.uv, _NoiseTex);
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                TRANSFER_SHADOW(o);
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                float noise = tex2D(_NoiseTex, i.noiseUV).r;

                // Clip pixels below dissolve threshold
                clip(noise - _DissolveAmount);

                float3 normal = normalize(i.worldNormal);
                float NdotL = max(0, dot(normal, normalize(_WorldSpaceLightPos0.xyz)));

                float4 tex = tex2D(_MainTex, i.uv) * _Color;
                float atten = SHADOW_ATTENUATION(i);
                float3 diffuse = tex.rgb * _LightColor0.rgb * NdotL * atten;
                float3 ambient = tex.rgb * UNITY_LIGHTMODEL_AMBIENT.rgb;
                float3 base = diffuse + ambient;

                // Edge glow
                float edge = 1.0 - smoothstep(0.0, _EdgeWidth, noise - _DissolveAmount);
                float innerEdge = 1.0 - smoothstep(0.0, _EdgeWidth * 0.5, noise - _DissolveAmount);
                float3 edgeCol = lerp(_EdgeColor.rgb, _EdgeColor2.rgb, innerEdge);
                base = lerp(base, edgeCol, edge);

                return float4(base, 1.0);
            }
            ENDCG
        }
    }
    FallBack "Diffuse"
}`,
  },
  {
    id: 'glass-transparent',
    name: 'VRC Glass',
    description: 'Frosted glass shader with refraction-like distortion, tint color, and adjustable transparency. Ideal for visors, windows, and transparent accessories.',
    category: 'transparent',
    color: '#67e8f9',
    code: `Shader "VRCStudio/Glass"
{
    Properties
    {
        _MainTex ("Main Texture", 2D) = "white" {}
        _Color ("Glass Tint", Color) = (0.8, 0.9, 1, 0.3)
        _Opacity ("Opacity", Range(0, 1)) = 0.3
        _FresnelPower ("Fresnel Power", Range(0.5, 8)) = 3.0
        _FresnelOpacity ("Fresnel Opacity Boost", Range(0, 1)) = 0.6
        [HDR] _ReflectionColor ("Reflection Color", Color) = (0.8, 0.85, 1, 1)
        _ReflectionIntensity ("Reflection Intensity", Range(0, 2)) = 0.5
        _Smoothness ("Smoothness", Range(0, 1)) = 0.9
        _DistortionStrength ("Surface Distortion", Range(0, 0.1)) = 0.02
    }

    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent" }
        Blend SrcAlpha OneMinusSrcAlpha
        ZWrite Off
        Cull Back

        // Grab pass for refraction-like distortion
        GrabPass { "_GrabTex" }

        Pass
        {
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag

            #include "UnityCG.cginc"
            #include "Lighting.cginc"

            sampler2D _MainTex;
            float4 _MainTex_ST;
            float4 _Color;
            float _Opacity;
            float _FresnelPower;
            float _FresnelOpacity;
            float4 _ReflectionColor;
            float _ReflectionIntensity;
            float _Smoothness;
            float _DistortionStrength;

            sampler2D _GrabTex;
            float4 _GrabTex_TexelSize;

            struct appdata
            {
                float4 vertex : POSITION;
                float3 normal : NORMAL;
                float2 uv : TEXCOORD0;
            };

            struct v2f
            {
                float4 pos : SV_POSITION;
                float2 uv : TEXCOORD0;
                float3 worldNormal : TEXCOORD1;
                float3 worldPos : TEXCOORD2;
                float4 grabPos : TEXCOORD3;
            };

            v2f vert(appdata v)
            {
                v2f o;
                o.pos = UnityObjectToClipPos(v.vertex);
                o.uv = TRANSFORM_TEX(v.uv, _MainTex);
                o.worldNormal = UnityObjectToWorldNormal(v.normal);
                o.worldPos = mul(unity_ObjectToWorld, v.vertex).xyz;
                o.grabPos = ComputeGrabScreenPos(o.pos);
                return o;
            }

            float4 frag(v2f i) : SV_Target
            {
                float3 normal = normalize(i.worldNormal);
                float3 viewDir = normalize(_WorldSpaceCameraPos - i.worldPos);

                // Fresnel
                float fresnel = pow(1.0 - saturate(dot(viewDir, normal)), _FresnelPower);

                // Distortion
                float2 distortion = normal.xy * _DistortionStrength;
                float2 grabUV = (i.grabPos.xy + distortion * i.grabPos.w) / i.grabPos.w;
                float4 grabbed = tex2D(_GrabTex, grabUV);

                // Fake reflection using view direction
                float3 reflDir = reflect(-viewDir, normal);
                float reflAmount = pow(saturate(reflDir.y * 0.5 + 0.5), 2.0) * _ReflectionIntensity;
                float3 refl = _ReflectionColor.rgb * reflAmount * _Smoothness;

                // Combine
                float4 tex = tex2D(_MainTex, i.uv);
                float3 tint = _Color.rgb * tex.rgb;
                float alpha = lerp(_Opacity, _Opacity + _FresnelOpacity, fresnel);
                alpha = saturate(alpha);

                float3 final = lerp(grabbed.rgb * tint, tint + refl, alpha);

                return float4(final, alpha);
            }
            ENDCG
        }
    }
    FallBack "Transparent/Diffuse"
}`,
  },
];

export function getShaderFileName(shader: ShaderInfo): string {
  return `${shader.name.replace(/\s+/g, '')}.shader`;
}

export function downloadShaderFile(shader: ShaderInfo): void {
  const blob = new Blob([shader.code], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = getShaderFileName(shader);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
