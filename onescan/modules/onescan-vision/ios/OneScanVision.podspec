Pod::Spec.new do |s|
  s.name           = 'OneScanVision'
  s.version        = '1.0.0'
  s.summary        = 'OneScan on-device document vision'
  s.description    = 'Camera frames, perspective correction, enhancement, OCR, redaction and PDF rasterisation — all on device.'
  s.author         = 'OneScan'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.license        = { type: 'Proprietary' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'Vision', 'CoreImage', 'PDFKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
  s.resources = ['docseg.bin']
end
