float attenuation ( float r, float f, float d ) {
  float denom = d / r + 1.0;
  float a = 1.0 / ( denom * denom );
  float t = ( a - f ) / ( 1.0 - f );

  return max(t, 0.0);
}

#pragma glslify: export(attenuation)
